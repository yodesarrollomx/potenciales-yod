/* PPP 2 · el plan que se cultiva solo.
 *
 * Esta página sólo muestra y pide: cada cifra la calcula el libro del plan en
 * Google Sheets y llega por el servidor de PPP 2 (server/ppp2/PPP2.gs). Aquí no
 * hay motor financiero ni datos de ningún plan: todo llega con la sesión de
 * quien abre, validada por el Portero.
 *
 * Nunca borra la credencial del Portero (pyod_clave_v1): si la sesión no sirve,
 * avisa y ofrece entrar de nuevo.
 *
 * Lo último que vio: para no esperar al libro, la página pinta al instante lo que
 * vio la última vez CON ESTA MISMA SESIÓN y trae lo nuevo en fondo; mientras no
 * llega, no guarda cambios. Misma disciplina que el cargador de YOD OS
 * (CHG-CARGADOR-FASE1-001): la copia vive en este navegador atada al hash de la
 * sesión, dura 12 h como máximo, se borra si la sesión se rechaza y va bajo el
 * prefijo del cargador (su purga también la limpia). ?cargador=legacy la apaga.
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
    trabajando: 'Hay un plan corriendo una ronda, unas pruebas, su consejo o una investigación, y el servidor atiende de uno en uno; tarda unos minutos. Vuelve a intentarlo cuando termine.',
    board: 'Tu acceso no incluye Potenciales.', portero: 'No pude validar tu sesión con el Portero; intenta de nuevo.',
    plan: 'Ese plan no existe o está archivado.', calculado: 'Ese renglón lo calcula el libro; no se captura.',
    prueba: 'La columna Prueba del libro (la usan las pruebas de estrés y el lápiz) no volvió a su estado: no se anotó nada y quedó en la bitácora. Avísale a Dirección.',
    sin_prueba: 'Este dato no se puede probar antes de guardarlo: guárdalo y, si no te convence, deshazlo.',
    restaurar: 'No encontré la fórmula que tenía este dato: hay que revisarlo en el libro (pestaña Datos).',
    paso: 'El libro dice que ahora no toca mover capital ni arranque de obra; recarga para ver el siguiente paso.',
    sin_lugar: 'No tengo una versión donde escribir mi propuesta: la base y la vigente no las toco, ni el trabajo de una persona si nadie me lo presta.',
    tiempo: 'Mi libro va lento y no alcancé a probar todas las combinaciones. No cambié nada y guardé lo que llevo: vuelve a pedirme la ronda para continuar.',
    cambio: 'Mi libro cambió mientras corría la ronda: lo que había leído ya no era cierto. No cambié nada; vuelve a pedirme la ronda.',
    lectura: 'No pude leer mi libro bajo uno de los golpes (da un error). No cambié nada: hay que revisar el libro.',
    rejilla: 'No hay combinaciones de capital y arranque de obra que probar alrededor de esta versión.',
    calcula: 'La versión de partida todavía no calcula: faltan datos.',
    modelo: 'A este libro le falta algo que la ronda necesita (las palancas de capital y de arranque de obra, o el paso de capital): hay que ponerlo al día con la plantilla.',
    sin_clave: 'Mi servidor todavía no tiene la clave de la API de IA. Dirección la pone una sola vez y desde ahí el consejo se convoca con este botón.',
    ia_clave: 'La API de IA rechazó la clave de mi servidor (vencida, sin saldo o mal copiada). No escribí nada: hay que revisar la clave.',
    ia: 'La API de IA no contestó bien (o tardó de más). No escribí nada; vuelve a intentarlo en unos minutos.',
    consejo_incompleto: 'No llegaron los siete votos válidos. No escribí ninguno: una sesión sólo vale completa. Vuelve a intentarlo en unos minutos.',
    sin_pruebas: 'Antes del consejo me tengo que probar contra los golpes con los números que tengo hoy.',
    apagado: 'El consejo y la investigación por API están apagados (renglón «consejo» = no en la hoja Config).',
    busqueda: 'Para investigar en la web necesito la clave de la API de Anthropic en mi servidor.',
    nada: 'No hay nada que investigar: no tengo candados abiertos ni pendientes del consejo.'
  };

  /* El plan es el autón: no hay un agente aparte. Esta página, su libro y sus herramientas SON el plan,
     por eso aquí habla en primera persona. Lo que dice sale de lo que calculó su libro (ciclo.paso). */
  /* Avisos que no se quitan solos: lo que no se arregla repitiendo enseguida se queda a la vista hasta que se toque. */
  var FIJOS = ['tiempo', 'trabajando', 'cambio', 'lectura', 'sin_lugar', 'modelo', 'rejilla', 'prueba', 'paso', 'pausa',
    'sin_clave', 'ia_clave', 'ia', 'consejo_incompleto', 'sin_pruebas', 'apagado', 'busqueda'];
  var CICLO = [['explorar', 'Muevo capital y arranque'], ['probar', 'Me pruebo contra los golpes'], ['consejo', 'Me defiendo ante el consejo'], ['direccion', 'Dirección decide']];
  /* fresco = lo que se ve llegó del servidor en esta visita; si es false, es lo último que vi (visto = cuándo) y,
     con sinRed, no pude traer lo nuevo. Mientras no sea fresco no se guarda nada. */
  /* pestana: la sección del expediente que está abierta debajo de los cuadros ('' = ninguna: la carátula limpia). */
  var estado = { vivero: null, plan: null, planId: '', pestana: '', version: 0, ocupado: false, fresco: true, visto: 0, sinRed: false,
    viveroCopia: null, factores: 'terreno', buscaFactor: '' };
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
  /* Las unidades que son cifras (las de la plantilla v2 incluidas: programa, norma, costo por partes y ritmo de ventas). */
  var NUMERICAS = ['MDP', '%', 'm²', 'meses', 'mes', '1/0', 'unidades', 'm', 'veces', 'niveles', 'cajones', 'por vivienda', 'm² por cajón', '$/m²', 'unidades por mes'];
  function valorDato(d) {
    var n = num(d.valor);
    if (n === null || NUMERICAS.indexOf(d.unidad) < 0) return esc(d.valor === null || d.valor === undefined || d.valor === '' ? '—' : d.valor);
    return cifra(d.unidad, n);
  }
  function claseEstado(e) {
    return { confirmado: 'verde', respondida: 'verde', cerrado: 'verde', vigente: 'verde', aceptado: 'verde', aprueba: 'verde',
      'en conflicto': 'rojo', falta: 'rojo', abierto: 'rojo', descartada: 'gris', descartado: 'gris', veto: 'rojo', regresa: 'rojo',
      propuesta: 'azul', investigando: 'azul', 'en revisión': 'azul', 'no aplica': 'gris', base: 'gris', alterna: 'gris' }[e] || '';
  }
  function chip(texto, clase) { return texto ? '<span class="p2-chip ' + (clase || claseEstado(texto)) + '">' + esc(texto) + '</span>' : ''; }
  /* El tope de capital (1/3 de las ventas) sólo avisa: el libro dice cuánto se pasa cada versión y la revisión no cambia. */
  function avisoTope(v, corto) {
    var n = num(v && v.capital_sobre_tope);
    if (n === null || n < 0.005) return '';
    return corto ? ' ' + chip('Pasa del tope', 'ambar') :
      '<div class="p2-aviso">' + chip('Aviso', 'ambar') + '<span>El capital pasa ' + mdp(n) + ' del tope de 1/3 de las ventas. Entre menos capital, mejor; es aviso: no cambia la revisión para fondos.</span></div>';
  }
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
    el.onclick = function () { el.hidden = true; };         // un toque lo cierra
    clearTimeout(toastT);
    if (!fijo) toastT = setTimeout(function () { el.hidden = true; }, 4200);
  }
  function configurado() { return !/\/PENDIENTE\//.test(ENDPOINT); }
  /* Si la API de IA no dio los votos, el servidor dice qué códigos contestó (sólo números). */
  function codigosAPI(r) {
    var c = r && Array.isArray(r.codigos) ? r.codigos.filter(function (x) { return typeof x === 'number'; }) : [];
    return c.length ? ' (La API contestó: ' + c.map(function (x) { return x || 'sin respuesta'; }).join(', ') + '.)' : '';
  }

  /* ───────── lo último que vi (ver la cabecera) ───────── */
  var MEMO = 'yodcg_cache_v1:ppp2:', MEMO_MS = 43200000, MEMO_PLANES = 3;
  function huellaSesion(t) {
    if (window.YodCargador && typeof window.YodCargador.hash === 'function') return window.YodCargador.hash(t);
    var h = 0x811c9dc5; t = String(t == null ? '' : t);            // el mismo FNV-1a del cargador
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function sinMemoria() {
    if (window.YodCargador && window.YodCargador.legacy) return true;
    try { return /[?&#]cargador=legacy(?=$|[&#])/.test(location.search + '&' + location.hash) || localStorage.getItem('yodcg_legacy') === '1'; } catch (e) { return true; }
  }
  function llaveMemo(que, id, t) { return MEMO + que + ':' + (id ? id + ':' : '') + huellaSesion(t); }
  function memorias() {
    var r = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(MEMO) === 0) r.push(k); } } catch (e) { }
    return r;
  }
  function recuerda(que, id) {
    var t = token();
    if (!t || sinMemoria()) return null;
    try {
      var o = JSON.parse(localStorage.getItem(llaveMemo(que, id, t)) || 'null'), edad = o ? Date.now() - Number(o.ts) : NaN;
      return o && o.data && o.data.ok === true && edad >= 0 && edad < MEMO_MS ? o : null;
    } catch (e) { return null; }
  }
  /* A lo más tres planes guardados; sin espacio, se van las copias de los otros planes. */
  function podaPlanes(llave, todas) {
    memorias().filter(function (k) { return k.indexOf(MEMO + 'plan:') === 0 && k !== llave; })
      .map(function (k) { var ts = 0; try { ts = Number(JSON.parse(localStorage.getItem(k)).ts) || 0; } catch (e) { } return { k: k, ts: ts }; })
      .sort(function (a, b) { return b.ts - a.ts; })
      .slice(todas ? 0 : MEMO_PLANES - 1)
      .forEach(function (x) { try { localStorage.removeItem(x.k); } catch (e) { } });
  }
  /* t = la sesión con la que se pidió: si cambió mientras volaba, no se guarda. */
  function memoriza(que, id, data, t) {
    if (!t || t !== token() || sinMemoria() || !data || data.ok !== true) return;
    var llave = llaveMemo(que, id, t), txt;
    try { txt = JSON.stringify({ ts: Date.now(), data: data }); } catch (e) { return; }
    if (que === 'plan') podaPlanes(llave);
    try { localStorage.setItem(llave, txt); } catch (e) {
      podaPlanes(llave, true);
      try { localStorage.setItem(llave, txt); } catch (x) { }
    }
  }
  function olvida(que, id) { try { localStorage.removeItem(llaveMemo(que, id, token())); } catch (e) { } }
  function olvidaTodo() { memorias().forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { } }); }
  function haceCuanto(ts) {
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return 'hace ' + m + (m === 1 ? ' minuto' : ' minutos');
    var h = Math.round(m / 60);
    return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
  }
  function refresco(copia) {
    if (!copia) return '';
    return '<div class="p2-refresco' + (copia.sinRed ? ' sin-red' : '') + '" role="status">' +
      (copia.sinRed
        ? '<i class="ti ti-cloud-off" aria-hidden="true"></i><span>No pude traer lo último de mi libro: te enseño lo que vi ' + haceCuanto(copia.visto) + '. Mientras, no guardo cambios.</span>' +
          '<button class="p2-btn suave" data-accion="refrescar"><i class="ti ti-refresh"></i> Intentar de nuevo</button>'
        : '<i class="ti ti-loader-2" aria-hidden="true"></i><span>Te enseño lo que vi ' + haceCuanto(copia.visto) + ' mientras traigo lo último de mi libro.</span>') + '</div>';
  }

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
      if (cambio) { escondeDeshacer(); estado.factores = 'terreno'; estado.buscaFactor = ''; }
      estado.planId = h[1];
      var pes = h[2] === 'auton' ? 'rondas' : h[2];
      estado.pestana = ['editar', 'versiones', 'preguntas', 'rondas', 'bitacora'].indexOf(pes) >= 0 ? pes : '';
      var pedida = /^[123]$/.test(h[3] || '') ? Number(h[3]) : 0;
      if (cambio || !estado.plan) { estado.plan = null; estado.version = pedida; estado.fresco = true; estado.sinRed = false; cargarPlan(); } else { if (pedida) estado.version = pedida; pintarPlan(); }
    } else {
      escondeDeshacer();
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
      raiz.innerHTML = '<div class="p2-error"><h2>Tu sesión ya no sirve aquí</h2><p>Entra de nuevo con tu correo de YOD y vuelve a abrir el PPP.</p>' +
        '<button class="p2-btn oro" data-accion="entrar">Entrar con mi correo</button></div>';
      return;
    }
    if (e === 'board') {
      raiz.innerHTML = '<div class="p2-error"><h2>Tu acceso corresponde al archivo de Potenciales</h2><a class="p2-btn" href="index.html?archivo=1">Abrir mis expedientes anteriores</a></div>';
      return;
    }
    raiz.innerHTML = '<div class="p2-error"><h2>No pude abrir el PPP</h2><p>' + esc(ERRORES[e] || 'El servidor no respondió. Revisa tu conexión e intenta de nuevo.') + '</p>' +
      '<button class="p2-btn" data-accion="reintentar">Intentar de nuevo</button></div>';
  }
  function sinSesion() {
    raiz.innerHTML = '<div class="p2-error"><h2>Entra para ver el vivero</h2><p>PPP 2 usa tu sesión de YOD. Entra con tu correo y la página se abre sola.</p>' +
      '<button class="p2-btn oro" data-accion="entrar">Entrar con mi correo</button></div>';
  }
  function cargarVivero() {
    if (!configurado()) { raiz.innerHTML = '<div class="p2-error"><h2>El servidor de PPP 2 aún no está instalado</h2><p>La página está lista; falta publicar su servidor.</p></div>'; return; }
    if (!token()) { sinSesion(); return; }
    var t = token(), previo = recuerda('vivero', '');
    if (previo) { estado.vivero = previo.data; estado.viveroCopia = { visto: previo.ts, sinRed: false }; pintarVivero(); }
    else cargando('Abriendo planes de potencial…');
    leer('ppp2-vivero').then(function (r) {
      if (r && r.ok) memoriza('vivero', '', r, t);
      if (estado.planId) return;                          // ya se fue a un plan
      if (!r || !r.ok) {
        var e = (r && r.error) || 'red';
        if (RECHAZOS.indexOf(e) >= 0) olvidaTodo();
        else if (e === 'board') olvida('vivero', '');
        else if (previo && estado.viveroCopia) { estado.viveroCopia.sinRed = true; pintarVivero(); return; }   // lo que vi sigue a la vista
        estado.viveroCopia = null;
        return fallo(r);
      }
      estado.vivero = r; estado.viveroCopia = null; pintarVivero();
    }, function () {
      if (estado.planId) return;
      if (previo && estado.viveroCopia) { estado.viveroCopia.sinRed = true; pintarVivero(); return; }
      fallo({ error: 'red' });
    });
  }
  /* Sin plan en pantalla, se pinta al instante lo último que vi de él (si hay) y se trae lo nuevo en fondo. */
  function cargarPlan(silencioso) {
    if (!configurado()) { cargarVivero(); return; }
    if (!token()) { sinSesion(); return; }
    var id = estado.planId, t = token(), previo = null;
    if (!estado.plan) {
      previo = recuerda('plan', id);
      if (previo) {
        estado.plan = previo.data; estado.fresco = false; estado.visto = previo.ts; estado.sinRed = false;
        if (!estado.version) estado.version = Number(previo.data.resumen['plan.version_mostrada']) || 1;
        pintarPlan();
      } else if (!silencioso) cargando('Abriendo el plan…');
    }
    return leer('ppp2-plan', { plan: id }).then(function (r) {
      if (r && r.ok) memoriza('plan', id, r, t);
      if (id !== estado.planId) return;                   // ya se fue a otro lado
      if (!r || !r.ok) {
        var e = (r && r.error) || 'red';
        if (RECHAZOS.indexOf(e) >= 0) olvidaTodo();
        else if (e === 'plan' || e === 'board') olvida('plan', id);
        else if (estado.fresco === false && estado.plan) { estado.sinRed = true; pintarPlan(); return; }   // lo que vi sigue a la vista
        estado.fresco = true;
        return fallo(r);
      }
      estado.plan = r; estado.fresco = true; estado.sinRed = false;
      if (!estado.version) estado.version = Number(r.resumen['plan.version_mostrada']) || 1;
      pintarPlan();
    }, function () {
      if (id !== estado.planId) return;
      if (estado.fresco === false && estado.plan) { estado.sinRed = true; pintarPlan(); return; }
      fallo({ error: 'red' });
    });
  }

  /* ───────── vivero ───────── */
  function frase(p) {
    if (num(p.dueno_recibe) === null) return '<span class="p2-tenue">Todavía no calcula: faltan datos.</span>';
    return 'El dueño aporta ' + mdp(p.dueno_aporta) + ' de tierra y recibe <b>' + mdpCorto(p.dueno_recibe) + ' MDP</b> · ' + veces(p.dueno_veces) +
      ' su tierra · en ' + meses(p.dueno_meses);
  }
  function pintarVivero() {
    var v = estado.vivero, puede = v.puede || {};
    var anteriores = location.hash === '#/anteriores';
    var planes = (v.planes || []).filter(function (p) { return anteriores ? p.paso !== 'captura_v3' : p.paso === 'captura_v3'; });
    var tarjetas = planes.map(function (p) {
      if (!anteriores) return '<a class="p2-tarjeta" href="#/plan/' + esc(p.plan_id) + '"><h2>' + esc(p.nombre) + '</h2><p>' +
        esc(p.ubicacion) + '</p><div class="p2-chico">' + esc(p.siguiente_pregunta) + '</div></a>';
      if (p.error) return '<div class="p2-tarjeta"><h2>' + esc(p.nombre) + '</h2><p class="p2-tenue">No pude leer su libro.</p></div>';
      return '<a class="p2-tarjeta" href="#/plan/' + esc(p.plan_id) + '">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">' + edad(p.edad) + chip('V' + p.version + ' · ' + (p.version_estado || ''), claseEstado(p.version_estado)) + '</div>' +
        '<h2>' + esc(p.nombre) + '</h2><div class="p2-tenue p2-chico">' + esc(p.ubicacion) + '</div>' +
        '<div class="p2-radiografia"><div class="p2-sobre">Lo que recibe el dueño</div>' +
        (p.a_medias ? '<span class="p2-tenue">Estoy corriendo una ronda en esta versión: sus cifras están a medias. Vuelve en unos minutos.</span>' :
          num(p.dueno_recibe) === null ? '<span class="p2-tenue">Todavía no calcula.</span>' :
          '<b>' + mdpCorto(p.dueno_recibe) + ' MDP</b> <span class="p2-tenue">en ' + (num(p.dueno_meses) || '—') + ' meses · ' + veces(p.dueno_veces) + ' su tierra</span>') + '</div>' +
        '<div class="p2-chico"><b>Para crecer:</b> ' + esc(p.para_crecer || '—') + '</div>' +
        (p.siguiente_pregunta ? '<div class="p2-chico"><b>Siguiente pregunta:</b> ' + esc(p.siguiente_pregunta) + '</div>' : '') +
        '<div class="p2-pie">' + chip(p.a_medias ? 'en trabajo' : (p.revision || 'sin revisión'), p.a_medias ? 'ambar' : (/^Pasa/.test(p.revision || '') ? 'verde' : (/^No/.test(p.revision || '') ? 'rojo' : 'gris'))) +
        chip((p.candados_abiertos || 0) + ' candados abiertos', p.candados_abiertos ? 'rojo' : 'verde') + chip((p.preguntas_abiertas || 0) + ' preguntas abiertas', 'gris') + '</div></a>';
    }).join('');
    raiz.innerHTML = refresco(estado.viveroCopia) +
      '<div class="p2-cabeza"><div><h1>' + (anteriores ? 'Planes anteriores' : 'Planes de potencial') + '</h1>' +
      '<p class="p2-intro">' + (anteriores ? 'Expedientes del Vivero pendientes de migración.' : 'Empieza con el nombre del terreno. Cada dato que agregas queda en su libro y define la siguiente pregunta.') + '</p></div>' +
      (!anteriores && puede.editar && !estado.viveroCopia ? '<button class="p2-btn oro" data-accion="sembrar"><i class="ti ti-seedling"></i> Crear plan en blanco</button>' : '') + '</div>' +
      (tarjetas ? '<div class="p2-rejilla">' + tarjetas + '</div>' : '<div class="p2-vacio">' + (anteriores ? 'No hay expedientes anteriores en este registro.' : 'Todavía no hay planes en el nuevo sistema.') + '</div>') +
      ((v.planes || []).some(function (p) { return !!p.error; }) ? '<p role="status">Hay libros que no se pudieron leer. <button class="p2-btn suave" data-accion="refrescar">Volver a consultar</button></p>' : '') +
      '<nav class="p2-acciones"><a class="p2-btn suave" href="' + (anteriores ? '#/' : '#/anteriores') + '">' + (anteriores ? 'Volver a planes de potencial' : 'Consultar expedientes anteriores') + '</a>' +
      (anteriores ? '<a class="p2-btn suave" href="index.html?archivo=1">Abrir mapa y archivo histórico</a>' : '') + '</nav>';
    if (location.hash === '#/nuevo' && !estado.viveroCopia) {
      history.replaceState(null, '', location.pathname + location.search + '#/');
      if (puede.editar) dialogoSembrar();
    }
  }
  function dialogoSembrar() {
    abrirDialogo('<h2>Crear plan en blanco</h2><p class="p2-tenue">Sólo necesitas un nombre. Puedes completar los demás datos después.</p>' +
      '<form class="p2-form" data-form="sembrar">' +
      '<label>Nombre del plan<input name="nombre" required minlength="3" maxlength="80" autocomplete="off"></label>' +
      '<label>Ubicación<input name="ubicacion" maxlength="300"></label>' +
      '<label>Tipo de proyecto<input name="tipo" maxlength="200" placeholder="Vertical, lotes, casas, mixto…"></label>' +
      '<label>Qué se quiere conseguir<textarea name="objetivo" maxlength="500" rows="3"></textarea></label>' +
      '<label>Superficie del terreno (m²)<input name="terreno_m2" inputmode="decimal"></label>' +
      '<div class="p2-acciones"><button class="p2-btn oro" type="submit">Crear plan</button><button class="p2-btn suave" type="button" data-accion="cerrar">Cancelar</button></div></form>');
  }

  /* ───────── plan ───────── */
  function ver(k) { return (estado.plan.versiones || [])[(k || estado.version) - 1] || {}; }
  /* La carátula del plan es el visor: encabezado, versiones, los siete cuadros y lo que dice el plan.
     Lo demás (versiones lado a lado, preguntas, rondas y bitácora) vive en el expediente, cerrado hasta que se pide. */
  function pintarPlan() {
    var p = estado.plan, r = p.resumen || {}, v = ver(), puede = p.puede || {};
    if (r.esquema === 'ppp-libro-v3') {
      raiz.innerHTML = (estado.fresco ? '' : refresco({ visto: estado.visto, sinRed: estado.sinRed })) +
        window.PPPUnico.dibujar(p, { esc: esc, fresco: estado.fresco, valor: valorDato });
      return;
    }
    var vers = (p.versiones || []).map(function (x) {
      return '<button class="p2-vbtn" data-accion="version" data-v="' + x.numero + '" aria-pressed="' + (x.numero === estado.version) + '">' +
        '<b>V' + x.numero + ' · ' + esc(x.nombre || '') + '</b><span>' + esc(x.estado || '') + (num(x.dueno_recibe) !== null ? ' · dueño ' + mdpCorto(x.dueno_recibe) + ' MDP' : '') +
        ((p.ciclo || {}).defiende === x.numero && (p.ciclo || {}).paso ? ' · la que defiendo' : '') + '</span></button>';
    }).join('');
    raiz.innerHTML =
      '<div class="p2-migas"><a href="#/">Vivero</a><i class="ti ti-chevron-right"></i><span>' + esc(r['plan.nombre'] || '') + '</span></div>' +
      (estado.fresco === false ? refresco({ visto: estado.visto, sinRed: estado.sinRed }) : '') +
      '<div class="p2-cabeza"><div><h1>' + esc(r['plan.nombre'] || 'Plan') + '</h1><div class="p2-lugar">' + esc(r['plan.ubicacion'] || '') + '<span id="p2Folio"></span></div>' +
      '<div class="p2-crecer">' + edad(r['plan.edad']) + '<span class="p2-tenue"><b>Para crecer falta:</b> ' + esc(r['plan.para_crecer'] || '—') + '</span></div></div>' +
      (p.libro_url ? '<a class="p2-btn suave" href="' + esc(p.libro_url) + '" target="_blank" rel="noopener"><i class="ti ti-table"></i> Abrir el libro</a>' : '') + '</div>' +
      '<div class="p2-versiones" role="group" aria-label="Versiones">' + vers + '</div>' +
      (puede.editar ? '<div class="p2-editar-entrada"><a class="p2-btn oro" href="#/plan/' + esc(estado.planId) + '/editar"' + (estado.pestana === 'editar' ? ' aria-current="page"' : '') + '><i class="ti ti-adjustments-horizontal" aria-hidden="true"></i> Editar factores</a><span>Prueba una cifra, mira qué mueve y guárdala en la V' + estado.version + '.</span></div>' : '') +
      (estado.pestana === 'editar' && puede.editar ? panelFactores() : '') +
      '<section class="p2-cuadros" aria-label="El plan en siete cuadros"><div class="p2-cuadros-cab"><div><div class="p2-sobre">El plan en siete cuadros · V' + estado.version + '</div>' +
      '<span class="p2-tenue p2-chico">Toca un cuadro para ver sus puntos y de dónde sale cada cifra' + (puede.editar ? '; con el lápiz pruebas otra cifra antes de guardarla.' : '.') + '</span></div>' +
      (puede.editar ? '<button class="p2-btn suave" data-accion="compartir"><i class="ti ti-share-2"></i> Compartir visor</button>' : '') + '</div>' +
      '<div class="vz-inc-marco"><div id="p2Cuadros"></div></div>' + estadoVersion(v) + '</section>' +
      voz() + expediente();
    // etapa 2 del análisis «tablero por tablero»: el terreno y su etapa se leen del folio (ppp-folio.js), no se copian al plan
    if (window.YodPPPFolio) window.YodPPPFolio.caso('ppp2', estado.planId, document.getElementById('p2Folio'));
    pintarCuadros();
  }
  /* Bajo los cuadros, una sola línea: en qué estado está la versión que se ve y, para Dirección, aprobarla. */
  function estadoVersion(v) {
    var p = estado.plan, puede = p.puede || {}, ciclo = p.ciclo || {}, enTrabajo = (ciclo.en_ronda || ciclo.interrumpida) && ciclo.trabajo === estado.version;
    var html = '';
    if (enTrabajo) html = chip('En trabajo', 'ambar') + '<span>Estas cifras están a medias: ' + (ciclo.en_ronda ? 'estoy corriendo una ronda en esta versión' : 'una ronda se interrumpió en esta versión') + '. No se puede aprobar hasta que quede como estaba.</span>';
    else if (v.estado === 'propuesta') html = chip('Propuesta', 'azul') + '<span>Falta que Dirección la apruebe para que quede vigente.</span>' +
      (puede.aprobar ? '<button class="p2-btn verde" data-accion="aprobar" data-v="' + estado.version + '"><i class="ti ti-check"></i> Aprobar esta versión</button>' : '');
    else if (v.estado === 'vigente') html = chip('Vigente', 'verde') + '<span>Aprobada por ' + esc(v.aprobada_por || '—') + (v.fecha_aprobacion ? ' el ' + esc(fechaLibro(v.fecha_aprobacion)) : '') + '.</span>';
    else if (puede.aprobar && v.estado !== 'descartada') html = chip(v.estado || '', claseEstado(v.estado)) +
      '<button class="p2-btn" data-accion="aprobar" data-v="' + estado.version + '"><i class="ti ti-check"></i> Volver vigente esta versión</button>';
    else if (v.estado) html = chip(v.estado, claseEstado(v.estado));
    var norma = num(v.norma_alertas) > 0 ? '<div class="p2-aviso p2-norma">' + chip('Norma', 'rojo') + '<span>' + esc(v.norma_texto || (v.norma_alertas + ' reglas de la norma no se cumplen.')) +
      ' <button type="button" class="p2-enlace" data-accion="abrir-cuadro" data-c="terreno">Ver en el cuadro Terreno</button></span></div>' : '';
    var fuera = num(v.fuera_horizonte) > 0 ? '<div class="p2-aviso p2-norma">' + chip('Plazo', 'rojo') + '<span>Con este ritmo de ventas, ' + fmt(v.fuera_horizonte, 0) +
      (num(v.fuera_horizonte) === 1 ? ' unidad no se alcanza' : ' unidades no se alcanzan') + ' a firmar en los 60 meses que calcula el libro: sube el ritmo de ventas o empieza antes a vender. ' +
      '<button type="button" class="p2-enlace" data-accion="abrir-cuadro" data-c="producto">Ver en el cuadro Producto</button></span></div>' : '';
    return (html ? '<div class="p2-estado-v">' + html + '</div>' : '') + norma + fuera + avisoTope(v);
  }
  /* El expediente: lo que respalda a los cuadros. Cerrado por omisión; una sección se abre al pedirla y se cierra al volver a tocarla. */
  function expediente() {
    var abre = { versiones: pVersiones, preguntas: pPreguntas, rondas: pRondas, bitacora: pBitacora }[estado.pestana];
    return '<nav class="p2-pestanas p2-expediente" aria-label="El expediente del plan"><span class="p2-sobre">El expediente</span>' +
      pest('versiones', 'Versiones y reparto') + pest('preguntas', 'Preguntas y evidencia') + pest('rondas', 'Mis rondas') + pest('bitacora', 'Bitácora') + '</nav>' +
      (abre ? '<div id="p2Pestana">' + abre() + '</div>' : '');
  }

  /* ───────── el plan en siete cuadros (los mismos del visor) y sus ligas ─────────
     visor.js los dibuja con lo que el servidor leyó del libro (`ppp2-visor`, con la sesión): aquí sólo se piden y
     se montan. Con lo último que se pidió de esta versión se pinta al instante; si el libro cambió, se repinta. */
  var cuadros = { memo: null, turno: 0, ligas: null };
  function pintarCuadros() {
    var el = document.getElementById('p2Cuadros'), V = window.VisorPPP;
    if (!el || !V || !V.monta) return;
    var plan = estado.planId, v = estado.version, turno = ++cuadros.turno, lienzo = V.monta(el, { incrustado: true });
    vigilaHoja();
    var memo = cuadros.memo && cuadros.memo.plan === plan && cuadros.memo.v === v ? cuadros.memo : null;
    if (memo) lienzo.muestra(memo.d); else lienzo.mensaje('Dibujando el plan…', 'Leyendo el libro.');
    var extra = { plan: plan, v: v };
    if ((estado.plan.puede || {}).editar) extra.ligas = '1';
    if (memo && !extra.ligas) extra.si = memo.d.llave;
    leer('ppp2-visor', extra).then(function (d) {
      if (turno !== cuadros.turno || !document.body.contains(el)) return;
      if (d && d.ok && d.igual) return;
      if (!d || !d.ok) { if (!memo) lienzo.mensaje('No pude dibujar los cuadros', 'Las cifras del plan siguen abajo.'); return; }
      if (d.ligas) cuadros.ligas = { plan: plan, lista: d.ligas };
      var cambio = !memo || memo.d.llave !== d.llave;
      cuadros.memo = { plan: plan, v: v, d: d };
      if (cambio) lienzo.muestra(d, null, !!memo);
    }).catch(function () { if (turno === cuadros.turno && !memo && document.body.contains(el)) lienzo.mensaje('No pude dibujar los cuadros', 'Las cifras del plan siguen abajo.'); });
  }
  /* ───────── el lápiz: los puntos de cada cuadro y lo que los mueve ─────────
     Al abrir un cuadro, visor.js pinta su hoja (#vzModal). Aquí, sin tocar visor.js, se le agrega abajo «Lo que mueve
     este cuadro»: los datos y palancas que lo alimentan (del visor hacia atrás, ppp2-relaciones.js), cada uno con su
     lápiz para quien edita. El lápiz dice con qué está ligado cada cifra (sale de las fórmulas del libro), deja probar
     otra cifra en la columna Prueba del libro (ppp2-simular: nadie más la ve) y guardarla en la versión o en los datos;
     después de guardar, se puede deshacer. Aquí no se calcula ninguna cifra: todas salen del libro. */
  function rel() { return window.PPP2_RELACIONES || null; }
  var LAPIZ_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4"/><path d="M13.5 6.5l4 4"/></svg>';
  var CUADRO_NOMBRE = { terreno: 'Terreno', producto: 'Producto', tiempo: 'Tiempo', costo: 'Costo y ganancia', dinero: 'Dinero', reparto: 'Reparto', riesgo: 'Riesgo y estado' };
  function entrada(id) { var R = rel(); return R && R.entradas ? R.entradas[id] || null : null; }
  function palancaDe(c) { return (estado.plan.palancas || []).filter(function (x) { return x.clave === c; })[0] || null; }
  function datoDe(c) { return (estado.plan.datos || []).filter(function (x) { return x.clave === c; })[0] || null; }
  function corta(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; }
  function cifra(unidad, v) {
    if (num(v) === null) return v === '' || v === null || v === undefined ? '—' : esc(v);
    switch (unidad) {
      case '%': return pct(v);
      case 'MDP': return mdp(v);
      case 'mes': return 'mes ' + fmt(v, 0);
      case 'meses': return fmt(v, 0) + ' meses';
      case 'm²': return fmt(v, v % 1 ? 2 : 0) + ' m²';
      case 'm': return fmt(v, v % 1 ? 1 : 0) + ' m';
      case '1/0': return v ? 'sí' : 'no';
      case 'veces': return fmt(v, 2) + ' veces';
      case 'niveles': return fmt(v, 0) + (v === 1 ? ' nivel' : ' niveles');
      case 'cajones': return fmt(v, 0) + (v === 1 ? ' cajón' : ' cajones');
      case 'por vivienda': return fmt(v, 2) + ' por vivienda';
      case 'm² por cajón': return fmt(v, 0) + ' m² por cajón';
      case '$/m²': return '$' + fmt(v, 0) + ' por m²';
      case 'unidades por mes': return fmt(v, v % 1 ? 1 : 0) + ' por mes';
      case 'unidades': return fmt(v, 0) + ' unidades';
      default: return fmt(v, v % 1 ? 2 : 0);
    }
  }
  function enFicha() { return !!(estado.planId && estado.plan && document.getElementById('p2Cuadros')); }
  function vigilaHoja() {
    var modal = document.getElementById('vzModal');
    if (!modal || modal._p2 || typeof MutationObserver !== 'function') return;
    var caja = modal.querySelector('.vz-m-caja') || modal.firstElementChild;
    if (!caja) return;
    modal._p2 = true;
    var mira = function () { decoraHoja(modal, caja); };
    new MutationObserver(mira).observe(caja, { childList: true });
    new MutationObserver(mira).observe(modal, { attributes: true, attributeFilter: ['data-abierto', 'hidden'] });
  }
  function decoraHoja(modal, caja) {
    var id = modal.getAttribute('data-abierto');
    if (!id || modal.hidden || !enFicha() || caja.querySelector('.p2-mueve')) return;
    var html = mueveCuadro(id);
    if (!html) return;
    var s = document.createElement('section');
    s.className = 'p2-mueve';
    s.setAttribute('aria-label', 'Lo que mueve este cuadro');
    s.innerHTML = html;
    caja.appendChild(s);
    if ((estado.plan.puede || {}).editar) lapizEnRenglones(caja);
  }
  /* También en los renglones del propio cuadro que son un dato o una palanca: el lápiz va junto a «de dónde sale». */
  function identDeDato(k) {
    var R = rel();
    if (!R || !R.entradas) return '';
    if (R.entradas['dato:' + k]) return 'dato:' + k;
    for (var id in R.entradas) if (R.entradas[id].dato === k && R.entradas[id].tipo === 'palanca') return id;
    return '';
  }
  function lapizEnRenglones(caja) {
    Array.prototype.forEach.call(caja.querySelectorAll('dl > div > small'), function (sm) {
      if (sm.closest('.p2-mueve') || sm.querySelector('.p2-lapiz-mini')) return;
      var t = sm.textContent || '', m = /Libro · Datos · ([a-z]+\.[a-z0-9_]+)\s*$/.exec(t), ident = '';
      if (m) ident = identDeDato(m[1]);
      else if (/Libro · Resumen · v\d\.tierra\s*$/.test(t)) ident = 'palanca:tierra';
      else if (/Libro · Resumen · v\d\.obra_inicio\b/.test(t)) ident = 'palanca:obra_inicio';
      if (!ident || !entrada(ident)) return;
      sm.insertAdjacentHTML('beforeend', ' <button type="button" class="p2-lapiz-mini" data-accion="lapiz" data-e="' + esc(ident) + '">' + LAPIZ_SVG + ' cambiar</button>');
    });
  }
  function renglon(etiqueta, valor, nota, ident, titulo) {
    return '<div' + (ident ? ' class="con-lapiz"' : '') + '><dt>' + esc(etiqueta) + '</dt><dd>' + valor + '</dd>' +
      (ident ? '<button type="button" class="p2-lapiz" data-accion="lapiz" data-e="' + esc(ident) + '" aria-label="Cambiar ' + esc(titulo || etiqueta) + '" title="Cambiar">' + LAPIZ_SVG + '</button>' : '') +
      (nota ? '<small>' + nota + '</small>' : '') + '</div>';
  }
  function conceptoDe(e) {
    if (!e.producto) return e.concepto;
    var pr = (estado.plan.productos || [])[e.producto - 1];
    return pr && pr.nombre ? '% pagado durante la obra · ' + pr.nombre : '';
  }
  function renglonesDe(ident, k, editar) {
    var e = entrada(ident), p = estado.plan;
    if (!e) return [];
    if (e.tipo === 'palanca') {
      var pa = palancaDe(e.palanca), concepto = conceptoDe(e);
      if (!pa || pa.calculado || !concepto) return [];
      var d = e.dato ? datoDe(e.dato) : null, propia = pa.cambia[k - 1];
      var nota = propia ? 'Cifra propia de la V' + k + ' · los datos dicen ' + cifra(pa.unidad, pa.base)
        : (d ? 'De los datos del plan · ' + esc(d.estado || 'sin estado') + (d.fuente ? ' · ' + esc(corta(d.fuente, 80)) : '') : (e.producto ? 'De la pestaña Productos' : 'De esta versión'));
      return [renglon(concepto, cifra(pa.unidad, pa.v[k - 1]), nota, editar ? ident : '', concepto)];
    }
    if (e.tipo === 'dato') {
      var dd = datoDe(e.dato);
      if (!dd) return [];
      return [renglon(dd.concepto || e.concepto, valorDato(dd), esc(dd.estado || 'sin estado') + (dd.fuente ? ' · ' + esc(corta(dd.fuente, 80)) : '') +
        (e.solo_se_ve ? ' · se enseña en el cuadro; no mueve otras cifras' : ''), editar ? ident : '')];
    }
    if (e.tipo === 'productos') {
      return (p.productos || []).filter(function (x) { return x.nombre; }).map(function (x) {
        return renglon(x.nombre, (num(x.unidades) === null ? '—' : fmt(x.unidades, 0)) + ' u · ' + (num(x.m2) === null ? '—' : fmt(x.m2, 0)) + ' m²',
          (x.uso ? esc(x.uso) + ' · ' : '') + (num(x.precio_m2) === null ? '' : '$' + fmt(x.precio_m2, 0) + ' por m² · ') + 'ventas ' + mdp(x.ventas) + (x.estado ? ' · ' + esc(x.estado) : ''),
          editar ? 'producto:' + x.fila : '', x.nombre);
      });
    }
    if (e.tipo === 'reparto') {
      var rp = p.reparto || {}, nombres = ((rp.parametros || [])[0] || []).slice(1, 6), el = Number(rp.esquema) || 0;
      if (!nombres.length) return [];
      return [renglon('Esquema de reparto', esc(nombres[el - 1] || '—'), 'Se calcula con el flujo de la V' + esc(rp.version || k), editar ? 'reparto:esquema' : '')];
    }
    if (e.tipo === 'candados') {
      return (p.candados || []).map(function (c) {
        return renglon(c.candado, chip(c.estado), 'Lo cierra: ' + esc(c.cierra || '') + (c.evidencia ? ' · Evidencia: ' + esc(corta(c.evidencia, 80)) : ''), editar && c.estado !== 'cerrado' ? 'candado:' + c.id : '', c.candado);
      });
    }
    if (e.tipo === 'preguntas') {
      var sig = (p.preguntas || []).filter(function (q) { return q.siguiente; })[0];
      if (!sig) return [];
      return [renglon('La pregunta que más mueve el plan', '<button type="button" class="p2-enlace" data-accion="ir" data-a="preguntas">' + (editar ? 'Responder' : 'Ver') + '</button>', esc(sig.texto), '')];
    }
    return [];
  }
  function mueveCuadro(id) {
    var R = rel(), editar = !!(estado.plan.puede || {}).editar, k = estado.version, filas = [];
    if (!R || !R.cuadros || !R.cuadros[id]) return '';
    R.cuadros[id].forEach(function (ident) { filas = filas.concat(renglonesDe(ident, k, editar)); });
    if (!filas.length) return '';
    return '<h3>Lo que mueve este cuadro · V' + k + '</h3><p class="p2-mueve-pista">' +
      (editar ? 'Con el lápiz pruebas otra cifra, ves qué cambia y decides si la guardas.' : 'Las cifras que alimentan este cuadro y de dónde salen.') + '</p><dl>' + filas.join('') + '</dl>';
  }
  /* Una entrada directa al mismo lápiz: no crea otra copia de los datos ni otro motor. */
  function panelFactores() {
    return '<section id="p2Factores" class="p2-panel p2-factores" aria-labelledby="p2FactoresTitulo"><div class="p2-factores-cab"><div><div class="p2-sobre">V' + estado.version + ' · ' + esc(ver().nombre || '') + '</div><h2 id="p2FactoresTitulo">Editar factores</h2></div><a class="p2-btn suave" href="#/plan/' + esc(estado.planId) + '">Ver el plan</a></div>' +
      '<p class="p2-tenue">Elige un factor para ver sus relaciones. Puedes probar las palancas antes de guardar; los datos comunes y los productos indican qué versiones afectan.</p>' +
      '<label class="p2-busca-factor">Buscar un factor<input type="search" data-busca-factor value="' + esc(estado.buscaFactor) + '" placeholder="Capital, niveles, ventas…" aria-controls="p2FactoresLista"></label>' +
      '<div class="p2-grupos-factor" role="group" aria-label="Grupos de factores">' + Object.keys(CUADRO_NOMBRE).map(function (id) {
        return '<button type="button" class="p2-btn suave" data-accion="grupo-factor" data-c="' + id + '" aria-pressed="' + (estado.factores === id) + '">' + esc(CUADRO_NOMBRE[id]) + '</button>';
      }).join('') + '</div><div id="p2FactoresLista" class="p2-mueve">' + listaFactores() + '</div></section>';
  }
  function listaFactores() {
    var R = rel(), q = estado.buscaFactor.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, ''), filas = [], vistos = {};
    if (!R) return '<p>Los factores no se pudieron cargar. Recarga el plan.</p>';
    var ids = q ? Object.keys(R.entradas) : (R.cuadros[estado.factores] || []);
    ids.forEach(function (id) {
      if (vistos[id]) return; vistos[id] = true;
      var e = entrada(id), texto = [e.concepto, e.palanca, e.dato, (e.mueve || []).join(' ')].join(' ');
      if (e.tipo === 'productos') texto += ' ' + (estado.plan.productos || []).map(function (p) { return p.nombre; }).join(' ');
      if (q && texto.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').indexOf(q) < 0) return;
      filas = filas.concat(renglonesDe(id, estado.version, true));
    });
    return '<h3>' + (q ? 'Resultados de la búsqueda' : esc(CUADRO_NOMBRE[estado.factores])) + ' · V' + estado.version + '</h3>' +
      (filas.length ? '<dl>' + filas.join('') + '</dl>' : '<p class="p2-tenue">No hay factores para esta selección.</p>');
  }
  function refrescaFactores() {
    var el = document.getElementById('p2FactoresLista');
    if (el) el.innerHTML = listaFactores();
    document.querySelectorAll('[data-accion="grupo-factor"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-c') === estado.factores)); });
  }
  /* El deslizador sólo facilita introducir una cifra. Su recorrido no es un límite del proyecto;
     la cifra exacta sigue siendo editable y el servidor conserva toda la validación. */
  function controlCifra(unidad, mostrado) {
    var exacto = '<input name="valor" inputmode="decimal" autocomplete="off" value="' + esc(mostrado) + '">';
    if (unidad === '1/0') return exacto + '<button type="button" class="p2-switch" role="switch" aria-label="Activar este factor" aria-checked="' + (Number(mostrado) === 1) + '" data-accion="factor-switch"><span aria-hidden="true"></span><b>' + (Number(mostrado) === 1 ? 'Sí' : 'No') + '</b></button>';
    var n = Number(mostrado), max = Math.max(100, Math.ceil(Math.abs(n) * 2)), min = n < 0 ? -max : 0;
    var paso = ['mes', 'meses', 'niveles', 'cajones', 'unidades', '$/m²'].indexOf(unidad) >= 0 ? 1 : 0.01;
    if (unidad === '%') { min = -100; max = 500; paso = 0.1; }
    if (unidad === 'mes' || unidad === 'meses') { min = 0; max = 60; }
    return exacto + '<input type="range" data-factor-slider aria-label="Ajustar cifra" min="' + min + '" max="' + max + '" step="' + paso + '" value="' + esc(mostrado === '' ? 0 : mostrado) + '"><small class="p2-tenue">Desliza o escribe la cifra exacta. Nada se guarda al mover el control.</small>';
  }
  /* Cerrar la hoja del cuadro antes de ir a otra parte: la hoja vive en la historia del navegador (atrás la cierra). */
  function cierraHojaY(fn) {
    var x = document.querySelector('#vzModal:not([hidden]) .vz-x');
    if (!x) { fn(); return; }
    var hecho = false, sigue = function () { if (hecho) return; hecho = true; window.removeEventListener('popstate', sigue); setTimeout(fn, 0); };
    window.addEventListener('popstate', sigue);
    x.click();
    setTimeout(sigue, 450);
  }

  /* El diálogo del lápiz */
  var lapiz = { e: null, id: '', previo: null, marca: null, recargar: false };
  var DONDE_TXT = { version: 'Sólo en esta versión', dato: 'En los datos del plan' };
  function ligadoA(e, comoDato) {
    var p = e.pasa_por || [], m = e.mueve || [], r = e.revision || [];
    if (comoDato && e.dato_otros) { p = e.dato_pasa_por || p; m = e.dato_mueve || m; }
    var clave = ['Lo que cumple de la norma', 'Ventas', 'Costo sin tierra', 'Fin de obra', 'Capital', 'Banco (saldo máximo)', 'Dinero que faltaría', 'Ganancia real', 'Lo que recibe el dueño', 'Mes de reparto', 'Edad del plan'];
    var top = m.filter(function (x) { return clave.indexOf(x) >= 0; }).slice(0, 6);
    if (!p.length && !top.length && !r.length) return '<p class="p2-chico p2-tenue">Se enseña en el cuadro; ninguna otra cifra del plan depende de este dato.</p>';
    return (p.length ? '<p><b>Pasa por</b> ' + esc(p.slice(0, 4).join(' · ')) + (p.length > 4 ? ' <span class="p2-tenue">y ' + (p.length - 4) + ' cálculos más</span>' : '') + '</p>' : '') +
      (top.length ? '<p><b>Mueve</b> ' + esc(top.join(' · ')) + (m.length > top.length ? ' <span class="p2-tenue">y ' + (m.length - top.length) + ' más</span>' : '') + '</p>' : '') +
      (r.length ? '<p><b>Puede mover la revisión para fondos:</b> ' + esc(r.join(', ')) + '.</p>' : '');
  }
  function versionesQueSiguen(pa) { return [1, 2, 3].filter(function (k) { return !pa.cambia[k - 1]; }); }
  function abrirLapiz(ident) {
    var e = entrada(ident), p = estado.plan, puede = p.puede || {}, k = estado.version;
    if (!puede.editar) return;
    if (/^candado:/.test(ident)) { dialogoCandado(ident.slice(8)); return; }
    if (/^producto:/.test(ident)) { dialogoProducto(Number(ident.slice(9))); return; }
    if (ident === 'reparto:esquema') { dialogoEsquema(); return; }
    if (!e) return;
    // el programa de una versión cambia lo que se construye y su costo; lo que se vende sale de los productos
    if (e.palanca === 'niveles' || e.palanca === 'desplante' || e.palanca === 'planta_baja') e = Object.assign({}, e, { nota: 'Si los datos del plan traen huella y niveles, cambia la construcción y su costo en esta versión (si no, escribe la construcción de la versión). Lo que se vende sale de los productos: si cambia lo que cabe, ajústalos. ' + (e.nota || '') });
    lapiz.e = e; lapiz.id = ident;
    var pa = e.tipo === 'palanca' ? palancaDe(e.palanca) : null, d = e.dato ? datoDe(e.dato) : null;
    var unidad = pa ? pa.unidad : (d ? d.unidad : e.unidad), hoy = pa ? pa.v[k - 1] : (d ? d.valor : null);
    var esNumero = NUMERICAS.indexOf(unidad) >= 0;
    var mostrado = unidad === '%' && num(hoy) !== null ? Math.round(hoy * 10000) / 100 : (hoy == null ? '' : hoy);
    var vigente = ver(k).estado === 'vigente', bloqueada = vigente && !puede.aprobar;
    var opciones = '';
    if (pa) {
      var siguen = versionesQueSiguen(pa).map(function (x) { return 'V' + x; });
      var conDato = !!(e.dato || e.producto);
      opciones = '<fieldset class="p2-donde"><legend>Dónde se guarda</legend>' +
        '<label><input type="radio" name="donde" value="version"' + (bloqueada ? ' disabled' : ' checked') + '> Sólo en la V' + k + (bloqueada ? ' <span class="p2-tenue">(es la vigente: sólo la cambia Dirección)</span>' : '') + '</label>' +
        (conDato ? '<label><input type="radio" name="donde" value="dato"' + (bloqueada ? ' checked' : '') + '> En ' + (e.producto ? 'la pestaña Productos' : 'los datos del plan') + ': lo toman ' +
          (siguen.length ? 'las versiones que siguen los datos (' + esc(siguen.join(', ')) + ')' : 'las versiones que siguen los datos (hoy ninguna)') + '</label>' : '') + '</fieldset>';
    }
    var derivado = d && d.estado === 'derivado', sinLugar = pa && bloqueada && !(e.dato || e.producto);
    var pideFuente = !pa || e.dato;
    abrirDialogo('<div class="p2-sobre">' + esc(CUADRO_NOMBRE[e.cuadro] || 'Lápiz') + ' · V' + k + '</div><h2>' + esc(conceptoDe(e) || e.concepto) + '</h2>' +
      '<p class="p2-tenue">Hoy en la V' + k + ': <b>' + cifra(unidad, hoy) + '</b>' + (pa && pa.cambia[k - 1] ? ' · cifra propia de esta versión' : (d ? ' · ' + esc(d.estado || '') : '')) + '</p>' +
      '<div class="p2-ligado"><div class="p2-sobre">Está ligado a</div><div data-ligado>' + ligadoA(e, false) + '</div>' + (e.nota ? '<p class="p2-chico p2-tenue">' + esc(e.nota) + '</p>' : '') + '</div>' +
      '<form class="p2-form" data-form="lapiz">' +
      '<label>Otra cifra' + (unidad && unidad !== 'texto' ? ' <span class="p2-tenue">(' + esc(unidad === '%' ? '% · escribe 30 para 30%' : unidad === '1/0' ? '1 sí · 0 no' : unidad) + ')</span>' : '') +
      (esNumero ? controlCifra(unidad, mostrado) : '<textarea name="valor" rows="2">' + esc(mostrado) + '</textarea>') + '</label>' +
      opciones +
      (derivado ? '<p class="p2-chico p2-aviso-chico">Hoy lo calcula el libro' + (d.fuente ? ' (' + esc(corta(d.fuente, 90)) + ')' : '') + '. Si escribes una cifra en los datos, deja de calcularse.</p>' : '') +
      (pideFuente ? '<div class="p2-fuente"' + (pa ? ' data-solo-dato="1" hidden' : '') + '><label>Estado del dato<select name="estado">' +
        ['confirmado', 'supuesto', 'por confirmar', 'en conflicto', 'derivado', 'falta'].map(function (x) { return '<option' + (d && x === d.estado ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
        '<label>De dónde sale<textarea name="fuente" rows="2" placeholder="Documento, persona o fecha">' + esc(d ? d.fuente || '' : '') + '</textarea></label></div>' : '') +
      '<div class="p2-lapiz-res" id="p2LapizRes" aria-live="polite">' + (pa ? '' : '<p class="p2-chico p2-tenue">Este dato no tiene columna de prueba en el libro: al guardarlo cambian las cifras de todas las versiones que lo usan, y lo puedes deshacer enseguida.</p>') + '</div>' +
      (sinLugar ? '<p class="p2-chico p2-aviso-chico">La V' + k + ' es la vigente: sólo la cambia Dirección. Aquí puedes probar la cifra y ver qué cambiaría.</p>' : '') +
      (e.dato_otros ? '<p class="p2-chico p2-tenue" data-otros hidden>Ese dato también lo leen otras cuentas del libro (' + esc((e.dato_pasa_por || []).filter(function (x) { return x !== 'Indirectos' && x !== 'Imprevistos'; }).slice(0, 3).join(', ') || 'otras cifras') +
        '): guardarlo en los datos mueve más que esta palanca, así que no lo puedo probar antes. Guárdalo y, si no te convence, toca «Deshacer».</p>' : '') +
      '<div class="p2-acciones">' + (pa ? '<button type="button" class="p2-btn" data-accion="lapiz-probar"><i class="ti ti-eye" aria-hidden="true"></i> Ver qué cambia</button>' : '') +
      (sinLugar ? '' : '<button class="p2-btn oro" type="submit">Guardar</button>') + '<button class="p2-btn suave" type="button" data-accion="cerrar">' + (sinLugar ? 'Cerrar' : 'Cancelar') + '</button></div></form>');
    if (pa) dondeCambia();
  }
  function dondeCambia() {
    var f = document.querySelector('#p2Dialogo form[data-form="lapiz"]'), caja = f && f.querySelector('.p2-fuente[data-solo-dato]');
    if (!f) return;
    var donde = (f.querySelector('input[name="donde"]:checked') || {}).value || 'version';
    if (caja) caja.hidden = donde !== 'dato' || !!(lapiz.e && lapiz.e.producto);
    // un dato que otras cuentas también leen no se prueba por su palanca: se dice y el botón se quita
    var otros = !!(lapiz.e && lapiz.e.dato_otros) && donde === 'dato', aviso = f.querySelector('[data-otros]'), probar = f.querySelector('[data-accion="lapiz-probar"]');
    if (aviso) aviso.hidden = !otros;
    if (probar) probar.hidden = otros;
    var lig = f.closest('.p2-caja') && f.closest('.p2-caja').querySelector('[data-ligado]');
    if (lig && lapiz.e && lapiz.e.dato_otros) lig.innerHTML = ligadoA(lapiz.e, donde === 'dato');
    limpiaPrueba();
  }
  /* El resultado de una prueba vale sólo para la cifra y el lugar que se probaron: si cambian, se borra. */
  function limpiaPrueba() {
    lapiz.marca = null;
    var res = document.getElementById('p2LapizRes');
    if (res && res.getAttribute('data-probado')) { res.innerHTML = ''; res.removeAttribute('data-probado'); }
  }
  function valorLapiz(f) {
    var e = lapiz.e, pa = e.tipo === 'palanca' ? palancaDe(e.palanca) : null, d = e.dato ? datoDe(e.dato) : null;
    var unidad = pa ? pa.unidad : (d ? d.unidad : e.unidad), crudo = f.valor.value;
    if (NUMERICAS.indexOf(unidad) < 0) return { ok: true, valor: crudo };
    var n = aNumero(crudo, unidad);
    if (n === null || isNaN(n)) return { ok: false };
    return { ok: true, valor: n };
  }
  var FILAS_LAPIZ = [
    ['ventas', 'Ventas', 'MDP', 1], ['obra', 'Obra directa', 'MDP', -1], ['costo_con_tierra', 'Costo con tierra', 'MDP', -1],
    ['ganancia', 'Ganancia real', 'MDP', 1], ['banco_max', 'Banco, saldo máximo', 'MDP', -1], ['respaldo', 'Dinero que faltaría', 'MDP', -1],
    ['costo_dinero', 'Costo del dinero', 'MDP', -1], ['aportacion', 'Tierra y capital entre costo', '%', 1],
    ['preventa_inicio', 'Preventa al arrancar la obra', '%', 1], ['fin_obra', 'Fin de obra', 'mes', -1], ['mes_reparto', 'Mes de reparto', 'mes', -1],
    ['construidos', 'Construcción sobre el terreno', 'm²', 0], ['cus_usado', 'Intensidad (veces el terreno)', 'veces', 0], ['cos_usado', 'Ocupación del terreno', '%', 0],
    ['cajones_pide', 'Cajones que pide la norma', 'cajones', 0]
  ];
  function diferente(u, a, b) {
    if (a === undefined || b === undefined) return false;          // un libro de la plantilla v1 no trae el programa ni la norma
    if (num(a) === null || num(b) === null) return a !== b;
    return Math.abs(a - b) >= (u === 'MDP' ? 0.05 : (u === '%' ? 0.0005 : (u === 'veces' ? 0.005 : 0.5)));
  }
  /* Avisos con los mismos límites que dibuja el visor (los de la revisión para fondos del libro). */
  function avisosLapiz(antes, despues) {
    var V = window.VisorPPP, out = [], P = {};
    ((V && V.PRUEBAS) || []).forEach(function (x) { P[x.k] = x; });
    var falta = num(despues.respaldo), faltaba = num(antes.respaldo);
    if (falta !== null && falta >= 0.01) out.push(['mal', 'Faltaría dinero: ' + mdp(falta) + ' de respaldo. La revisión para fondos pide que sea cero.']);
    else if (faltaba !== null && faltaba >= 0.01) out.push(['bien', 'Ya no faltaría dinero.']);
    if (num(despues.ganancia) !== null && despues.ganancia < 0) out.push(['mal', 'La ganancia real queda negativa.']);
    // la norma: el libro dice qué deja de cumplir (sólo en libros de la plantilla v2)
    var na = num(antes.alertas_norma), nb = num(despues.alertas_norma);
    if (nb !== null && nb > 0) out.push(['mal', (na !== null && na > 0 && antes.norma_texto === despues.norma_texto ? 'Sigue sin cumplir la norma: ' : 'Con esta cifra no cumple la norma: ') + (despues.norma_texto || nb + ' reglas.')]);
    else if (nb === 0 && na !== null && na > 0) out.push(['bien', 'Con esta cifra ya cumple la norma.']);
    [['aportacion', 'rv_aportacion', 'Tierra y capital entre costo'], ['preventa_inicio', 'rv_preventa', 'La preventa al arrancar la obra']].forEach(function (x) {
      var pr = P[x[1]], a = num(antes[x[0]]), b = num(despues[x[0]]);
      if (!pr || !V.estadoPrueba || b === null) return;
      var ea = a === null ? 'na' : V.estadoPrueba(pr, a), eb = V.estadoPrueba(pr, b);
      if (eb === 'fuera' && ea !== 'fuera') out.push(['mal', x[2] + ' queda en ' + pct(b) + ': deja de cumplir (se pide ' + pct(pr.lim) + ' o más).']);
      else if (eb === 'fuera') out.push(['mal', x[2] + ' sigue sin cumplir: ' + pct(b) + ' (se pide ' + pct(pr.lim) + ').']);
      else if (eb === 'justa' && ea !== 'justa') out.push(['ojo', x[2] + ' queda justa: ' + pct(b) + ' (lo ideal es ' + pct(pr.ideal) + ').']);
      else if (ea === 'fuera' && eb === 'ok') out.push(['bien', x[2] + ' ya cumple: ' + pct(b) + '.']);
    });
    return out;
  }
  function pintaPrueba(r, res, marca) {
    if (!res || !res.isConnected) return;
    res.setAttribute('data-probado', '1');
    if (r.sin_efecto && r.sin_efecto.length && (!r.cambios || !r.cambios.length)) {
      var s = r.sin_efecto[0];
      res.innerHTML = '<p class="p2-aviso-chico">La V' + r.version + ' tiene su propia cifra (' + cifra((palancaDe(s.palanca) || {}).unidad, s.propia) + '): cambiar el dato no la mueve. ' +
        'Para moverla, guárdalo «sólo en esta versión».</p>';
      return;
    }
    var a = r.antes || {}, b = r.despues || {}, cambian = FILAS_LAPIZ.filter(function (f) { return diferente(f[2], a[f[0]], b[f[0]]); });
    var filas = cambian.map(function (f) {
      var mejor = f[3] && num(a[f[0]]) !== null && num(b[f[0]]) !== null ? (b[f[0]] - a[f[0]]) * f[3] > 0 : null;
      return '<tr><td>' + esc(f[1]) + '</td><td class="n">' + cifra(f[2], a[f[0]]) + '</td><td class="n"><b>' + cifra(f[2], b[f[0]]) + '</b></td>' +
        '<td class="n ' + (mejor === null ? '' : (mejor ? 'sube' : 'baja')) + '">' + (mejor === null ? '' : (mejor ? '▲' : '▼')) + '</td></tr>';
    }).join('');
    var avisos = avisosLapiz(a, b).map(function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + '</li>'; }).join('');
    var probada = marca ? cifra(marca.unidad, marca.valor) + (marca.donde === 'dato' ? ' en los datos' : ' sólo en esta versión') : '';
    res.innerHTML = '<div class="p2-sobre">' + (probada ? 'Con ' + probada + ' · ' : '') + 'qué cambia en la V' + r.version + ' · lo calculó el libro en su columna de prueba</div>' +
      (filas ? '<table class="p2-tabla p2-antes"><thead><tr><th></th><th class="n">Hoy</th><th class="n">Con la cifra nueva</th><th></th></tr></thead><tbody>' + filas + '</tbody></table>'
        : '<p class="p2-chico">Con esta cifra no cambia ninguna de las cifras principales.</p>') +
      (avisos ? '<ul class="p2-avisos">' + avisos + '</ul>' : '') +
      '<p class="p2-chico p2-tenue">Nada se guardó todavía: el libro ya regresó a como estaba.' + (cambian.length < FILAS_LAPIZ.length && filas ? ' Lo demás no cambia.' : '') + '</p>';
  }
  function probarLapiz(b) {
    var f = document.querySelector('#p2Dialogo form[data-form="lapiz"]'), e = lapiz.e, res = document.getElementById('p2LapizRes');
    if (!f || !e || estado.ocupado) return;
    var v = valorLapiz(f);
    if (!v.ok) { toast('Escribe un número.'); return; }
    var donde = (f.querySelector('input[name="donde"]:checked') || {}).value || 'version';
    if (donde === 'dato' && e.dato_otros) return;
    var clave = donde === 'dato' && e.dato ? e.dato : e.palanca, cambio = { clave: clave, valor: v.valor };
    if (donde === 'dato' && e.producto) cambio.como_dato = true;     // el % de la pestaña Productos sólo mueve a las versiones que siguen la base
    if (estado.fresco === false) { toast('Un momento: estoy trayendo lo último de mi libro.'); return; }
    // la marca dice qué se probó: si cambian el diálogo, la cifra o el lugar antes de que conteste, el resultado no se pinta
    var marca = { id: lapiz.id, version: estado.version, donde: donde, valor: v.valor, unidad: (e.tipo === 'palanca' ? (palancaDe(e.palanca) || {}).unidad : e.unidad) };
    lapiz.marca = marca;
    estado.ocupado = true;
    b.disabled = true;
    if (res) { res.removeAttribute('data-probado'); res.innerHTML = '<p class="p2-chico p2-tenue"><i class="ti ti-loader-2" aria-hidden="true"></i> El libro está recalculando con esa cifra en su columna de prueba…</p>'; }
    var vigente = function () { return lapiz.marca === marca && res && res.isConnected; };
    escribir({ tipo: 'ppp2-simular', plan: estado.planId, rev: estado.plan.rev, version: estado.version, cambios: [cambio] }, 90000).then(function (r) {
      estado.ocupado = false;
      if (b.isConnected) b.disabled = false;
      if (r && RECHAZOS.indexOf(r.error) >= 0) { cerrarDialogo(); olvidaTodo(); fallo(r); return; }
      if (!vigente()) return;
      if (!r || !r.ok) {
        var er = (r && r.error) || 'red', txt = ERRORES[er] || 'No pude probar la cifra. Vuelve a intentarlo.';
        if (er === 'sin_prueba' && r.motivo === 'otros') txt = 'Ese dato también lo leen otras cuentas del libro: no lo puedo probar antes de guardarlo. Guárdalo y, si no te convence, toca «Deshacer».';
        // el libro cambió: no se recarga encima del diálogo; se trae lo último al cerrarlo
        if (er === 'revision') { txt = 'El libro cambió desde que lo abriste (alguien guardó algo). Cierra esta ventana: traigo lo último y vuelves a probar.'; lapiz.recargar = true; }
        res.innerHTML = '<p class="p2-aviso-chico">' + esc(txt) + '</p>';
        return;
      }
      pintaPrueba(r, res, marca);
    }, function () {
      estado.ocupado = false;
      if (b.isConnected) b.disabled = false;
      if (vigente()) res.innerHTML = '<p class="p2-aviso-chico">Sin respuesta del servidor. Vuelve a intentarlo.</p>';
    });
  }
  function guardarLapiz(f) {
    var e = lapiz.e, k = estado.version, d = new FormData(f);
    if (!e) return;
    if (estado.ocupado) { toast('Espera un momento: el libro todavía está probando la cifra.'); return; }
    var v = valorLapiz(f);
    if (!v.ok) { toast('Escribe un número.'); return; }
    var pa = e.tipo === 'palanca' ? palancaDe(e.palanca) : null, dato = e.dato ? datoDe(e.dato) : null;
    var donde = pa ? (d.get('donde') || 'version') : 'dato', nombre = conceptoDe(e) || e.concepto, cuerpo, deshacer, antesTxt, unidad;
    if (donde === 'version') {
      unidad = pa.unidad;
      cuerpo = { tipo: 'ppp2-palanca', version: k, clave: e.palanca, valor: v.valor, razon: 'Con el lápiz del cuadro ' + (e.cuadro || '') };
      deshacer = { tipo: 'ppp2-palanca', version: k, clave: e.palanca, valor: pa.cambia[k - 1] ? pa.v[k - 1] : null };
      antesTxt = cifra(unidad, pa.v[k - 1]);
      nombre += ' · V' + k;
    } else if (e.producto) {
      var pr = (estado.plan.productos || [])[e.producto - 1] || {};
      unidad = '%';
      cuerpo = { tipo: 'ppp2-producto', fila: e.producto, campos: { durante_obra: v.valor } };
      deshacer = { tipo: 'ppp2-producto', fila: e.producto, campos: { durante_obra: num(pr.durante_obra) === null ? 0 : pr.durante_obra } };
      antesTxt = cifra('%', pr.durante_obra);
    } else {
      unidad = dato ? dato.unidad : e.unidad;
      cuerpo = { tipo: 'ppp2-dato', clave: e.dato, valor: v.valor, estado: d.get('estado'), fuente: d.get('fuente') };
      deshacer = dato ? { tipo: 'ppp2-dato', clave: e.dato, valor: dato.valor === null || dato.valor === undefined ? '' : dato.valor, estado: dato.estado || '', fuente: dato.fuente || '' } : null;
      antesTxt = dato ? valorDato(dato) : '—';
    }
    var despuesTxt = cifra(unidad, v.valor);
    enviar(cuerpo, 'Guardado: el libro recalculó.').then(function (r) {
      if (!r || !r.ok || !deshacer) return;
      // si el libro calculaba ese dato, deshacer le regresa su fórmula (la guardó el servidor), no una cifra fija
      if (r.guardo_formula && cuerpo.tipo === 'ppp2-dato') deshacer = { tipo: 'ppp2-dato', clave: cuerpo.clave, restaurar: true, estado: deshacer.estado, fuente: deshacer.fuente };
      ofrecerDeshacer(nombre + ': ' + antesTxt.replace(/<[^>]+>/g, '') + ' → ' + String(despuesTxt).replace(/<[^>]+>/g, ''), deshacer, r);
    });
  }
  /* Después de guardar, un momento para deshacer: regresa exactamente lo que había (o la cifra de los datos). */
  var deshacerT = 0;
  function escondeDeshacer() {
    var el = document.getElementById('p2Deshacer');
    if (el) el.hidden = true;
    clearTimeout(deshacerT);
  }
  function ofrecerDeshacer(texto, cuerpo, r) {
    // deshacer va al plan donde se guardó y sólo si nadie lo ha cambiado desde entonces (la revisión del guardado)
    cuerpo.plan = estado.planId;
    cuerpo.rev = (r && r.plan && r.plan.plan_id === estado.planId && r.plan.rev) || (estado.plan && estado.plan.rev);
    var el = document.getElementById('p2Deshacer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'p2Deshacer'; el.className = 'p2-deshacer'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = '<span>Guardado · ' + esc(texto) + '</span><button type="button" class="p2-btn suave">Deshacer</button><button type="button" class="p2-x" aria-label="Cerrar">×</button>';
    el.hidden = false;
    clearTimeout(deshacerT);
    deshacerT = setTimeout(function () { el.hidden = true; }, 20000);
    el.querySelector('.p2-btn').onclick = function () {
      el.hidden = true; clearTimeout(deshacerT);
      if (cuerpo.plan !== estado.planId) { toast('Ese cambio era de otro plan: ábrelo y deshazlo desde su bitácora.'); return; }
      enviar(cuerpo, 'Listo: regresé la cifra que había.');
    };
    el.querySelector('.p2-x').onclick = function () { el.hidden = true; clearTimeout(deshacerT); };
  }
  function dialogoProducto(i) {
    var x = (estado.plan.productos || [])[i - 1];
    if (!x) return;
    // el uso: sólo en libros de la plantilla v2 (cuenta para los cajones); lo que no está en la lista se conserva y se dice
    var USOS = ['vivienda', 'comercio', 'oficina', 'otro'], usoN = String(x.uso || '').trim().toLowerCase();
    var conUso = /ppp2-libro-v[2-9]/.test(String((estado.plan.resumen || {}).esquema || '')), raro = usoN && USOS.indexOf(usoN) < 0;
    lapiz.previo = { fila: i, campos: { unidades: x.unidades, m2: x.m2, precio_m2: x.precio_m2, estado: x.estado || '', fuente: x.fuente || '', uso: raro ? String(x.uso) : usoN } };
    var R = entrada('productos');
    abrirDialogo('<div class="p2-sobre">Producto · todas las versiones</div><h2>' + esc(x.nombre) + '</h2>' +
      (R ? '<div class="p2-ligado"><div class="p2-sobre">Está ligado a</div>' + ligadoA(R) + '</div>' : '') +
      '<form class="p2-form" data-form="producto" data-fila="' + i + '">' +
      '<label>Unidades<input name="unidades" inputmode="decimal" value="' + esc(x.unidades == null ? '' : x.unidades) + '"></label>' +
      '<label>m² vendibles<input name="m2" inputmode="decimal" value="' + esc(x.m2 == null ? '' : x.m2) + '"></label>' +
      '<label>Precio por m² (pesos)<input name="precio_m2" inputmode="decimal" value="' + esc(x.precio_m2 == null ? '' : x.precio_m2) + '"></label>' +
      (conUso ? '<label>Uso <span class="p2-tenue">(cuenta para los cajones que pide la norma)</span><select name="uso"><option value="">sin decir</option>' +
        (raro ? '<option value="' + esc(x.uso) + '" selected>' + esc(x.uso) + ' (no cuenta para los cajones)</option>' : '') +
        USOS.map(function (u) { return '<option' + (u === usoN ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></label>' : '') +
      '<label>Estado<select name="estado">' + ['confirmado', 'supuesto', 'por confirmar', 'en conflicto', 'derivado', 'falta'].map(function (e) { return '<option' + (e === x.estado ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></label>' +
      '<label>De dónde sale<textarea name="fuente" rows="2">' + esc(x.fuente || '') + '</textarea></label>' +
      '<p class="p2-chico p2-tenue">Los productos no tienen columna de prueba: al guardar cambian las ventas de todas las versiones, y lo puedes deshacer enseguida.</p>' +
      '<div class="p2-acciones"><button class="p2-btn oro" type="submit">Guardar</button><button class="p2-btn suave" type="button" data-accion="cerrar">Cancelar</button></div></form>');
  }
  function dialogoEsquema() {
    var rp = estado.plan.reparto || {}, P = rp.parametros || [], R = rp.resultados || [], nombres = (P[0] || []).slice(1, 6), el = Number(rp.esquema) || 0;
    var dueno = (R[6] || []).slice(1, 6), vec = (R[7] || []).slice(1, 6);
    abrirDialogo('<div class="p2-sobre">Reparto · con el flujo de la V' + esc(rp.version || estado.version) + '</div><h2>Esquema de reparto</h2>' +
      '<p class="p2-tenue">Lo que recibiría el dueño con cada esquema (lo calcula el libro, pestaña Reparto).</p><form class="p2-form" data-form="esquema">' +
      nombres.map(function (n, j) {
        return '<label class="p2-opcion"><input type="radio" name="esquema" value="' + (j + 1) + '"' + (j + 1 === el ? ' checked' : '') + '> <span><b>' + esc(n) + '</b> · dueño ' + mdp(dueno[j]) + ' (' + veces(vec[j]) + ' su tierra)</span></label>';
      }).join('') +
      '<div class="p2-acciones"><button class="p2-btn oro" type="submit">Elegir</button><button class="p2-btn suave" type="button" data-accion="cerrar">Cancelar</button></div></form>');
    lapiz.previo = { esquema: el };
  }

  /* Una fecha del libro puede llegar como número de fecha de la hoja (días desde 1899-12-30): se enseña como fecha. */
  function fechaLibro(x) {
    if (typeof x !== 'number' || !(x > 20000 && x < 80000)) return x;
    var f = new Date(Math.round((x - 25569) * 86400000)), MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return f.getUTCDate() + '-' + MES[f.getUTCMonth()] + '-' + f.getUTCFullYear();
  }
  function ligaUrl(liga) { return new URL('visor.html', location.href).href.replace(/[?#].*$/, '') + '#l=' + liga; }
  function dialogoCompartir(nueva) {
    var lista = cuadros.ligas && cuadros.ligas.plan === estado.planId ? cuadros.ligas.lista : null;
    var otros = ((estado.vivero || estado.viveroCopia || {}).planes || []).filter(function (x) { return x.plan_id !== estado.planId && !x.error; });
    var previo = document.querySelector('#p2Dialogo form[data-form="liga"]');
    var escrito = previo && !nueva ? { para: previo.para.value, versiones: previo.versiones.value,
      otros: Array.prototype.map.call(previo.querySelectorAll('input[name="otro"]:checked'), function (x) { return x.value; }) } : null;
    var renglon = function (l) {
      var viva = l.estado === 'activa';
      return '<li class="p2-liga' + (viva ? '' : ' apagada') + '"><div><b>' + esc(l.para || 'Sin nombre') + '</b> ' + chip(viva ? 'Activa' : 'Apagada', viva ? 'verde' : 'gris') +
        '<span class="p2-tenue p2-chico">' + (l.versiones ? 'versiones: ' + esc(l.versiones) : 'sólo la versión que el plan muestra') + (l.planes > 1 ? ' · ' + l.planes + ' planes' : '') +
        ' · ' + (l.aperturas ? 'abierta ' + l.aperturas + (l.aperturas === 1 ? ' vez' : ' veces') + (l.ultima ? ' (la última, ' + esc(l.ultima) + ')' : '') : 'sin abrir todavía') + '</span></div>' +
        '<div class="p2-liga-botones">' + (viva ? '<button type="button" class="p2-btn suave" data-accion="liga-copiar" data-liga="' + esc(l.liga) + '"><i class="ti ti-copy"></i> Copiar liga</button>' : '') +
        '<button type="button" class="p2-btn suave" data-accion="liga-estado" data-op="' + (viva ? 'apagar' : 'activar') + '" data-liga="' + esc(l.liga) + '">' + (viva ? 'Apagar' : 'Encender') + '</button></div></li>';
    };
    abrirDialogo('<h2>Compartir el visor</h2>' +
      '<p class="p2-tenue">Una liga de sólo lectura para quien no tiene cuenta: ve este plan en una pantalla, con los mismos siete cuadros, y se actualiza sola cuando el libro cambia. <b>Quien tenga la liga ve el plan</b>: si se reenvió de más, apágala y da otra.</p>' +
      (nueva ? '<div class="p2-liga-nueva"><div class="p2-sobre">Liga nueva</div><input id="p2LigaNueva" readonly value="' + esc(ligaUrl(nueva)) + '">' +
        '<button type="button" class="p2-btn verde" data-accion="liga-copiar" data-liga="' + esc(nueva) + '"><i class="ti ti-copy"></i> Copiar liga</button></div>' : '') +
      (lista === null ? '<p class="p2-tenue">Buscando las ligas de este plan…</p>' : (lista.length ? '<ul class="p2-ligas">' + lista.map(renglon).join('') + '</ul>' : '<p class="p2-tenue">Este plan todavía no tiene ligas.</p>')) +
      '<form class="p2-form" data-form="liga"><label>Para quién es<input name="para" required maxlength="80" placeholder="Grupo de la alianza"></label>' +
      '<label>Qué versiones ve<select name="versiones"><option value="">Sólo la que el plan muestra (la vigente)</option><option value="todas">Todas las versiones, para escoger</option></select></label>' +
      (otros.length ? '<fieldset class="p2-otros"><legend>Otros planes en la misma liga (varios terrenos)</legend>' + otros.map(function (x) {
        return '<label class="p2-check"><input type="checkbox" name="otro" value="' + esc(x.plan_id) + '"> ' + esc(x.nombre || x.plan_id) + '</label>';
      }).join('') + '</fieldset>' : '') +
      '<div class="p2-acciones"><button type="button" class="p2-btn suave" data-accion="cerrar">Cerrar</button><button class="p2-btn verde"><i class="ti ti-link"></i> Crear liga</button></div></form>');
    if (escrito) {
      var f = document.querySelector('#p2Dialogo form[data-form="liga"]');
      f.para.value = escrito.para; f.versiones.value = escrito.versiones;
      Array.prototype.forEach.call(f.querySelectorAll('input[name="otro"]'), function (x) { x.checked = escrito.otros.indexOf(x.value) >= 0; });
      if (escrito.para) { f.para.focus(); f.para.setSelectionRange(escrito.para.length, escrito.para.length); }
    }
    if (!estado.vivero && !estado.viveroCopia && !dialogoCompartir.pidio) {     // los otros planes, por si la liga lleva varios terrenos
      dialogoCompartir.pidio = true;
      leer('ppp2-vivero').then(function (r) { if (r && r.ok) { estado.viveroCopia = r; if (document.getElementById('p2Dialogo') && document.querySelector('form[data-form="liga"]')) dialogoCompartir(nueva); } }).catch(function () { });
    }
  }
  function ligaAccion(cuerpo, alTerminar) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    var plan = estado.planId;
    cuerpo.tipo = 'ppp2-liga'; cuerpo.plan = plan;
    escribir(cuerpo).then(function (r) {
      estado.ocupado = false;
      if (!r || !r.ok) { toast(r && r.error === 'permiso' ? 'No tienes permiso para dar ligas de este plan.' : 'No pude guardar la liga. Vuelve a intentarlo.'); return; }
      cuadros.ligas = { plan: plan, lista: r.ligas || [] };
      if (plan === estado.planId) alTerminar(r);
    }).catch(function () { estado.ocupado = false; toast('No tengo conexión con mi servidor: no se guardó la liga.'); });
  }
  function copiarLiga(liga) {
    var url = ligaUrl(liga), listo = function () { toast('Liga copiada. Pégala en el grupo.'); };
    var aMano = function () { var c = document.getElementById('p2LigaNueva'); if (c) { c.value = url; c.focus(); c.select(); } else window.prompt('Copia la liga:', url); };
    try { navigator.clipboard.writeText(url).then(listo, aMano); } catch (e) { aMano(); }
  }
  function pest(id, texto) {
    var abierta = estado.pestana === id;
    return '<a href="#/plan/' + esc(estado.planId) + (abierta ? '' : '/' + id) + '"' + (abierta ? ' aria-current="page" title="Cerrar"' : '') + '>' + esc(texto) + '</a>';
  }

  /* pestaña: versiones y reparto */
  function pVersiones() {
    var p = estado.plan, puede = p.puede || {}, V = p.versiones || [];
    var filas = [
      ['Estado', function (x) { return chip(x.estado); }], ['Qué cambia', function (x) { return '<span class="p2-chico">' + esc(x.que_cambia || '') + '</span>'; }],
      ['El dueño recibe', function (x) { return '<b>' + mdp(x.dueno_recibe) + '</b>'; }, 'n'], ['Veces su tierra', function (x) { return veces(x.dueno_veces); }, 'n'],
      ['En cuántos meses', function (x) { return num(x.dueno_meses) === null ? '—' : esc(x.dueno_meses); }, 'n'], ['Ganancia real', function (x) { return mdp(x.ganancia); }, 'n'],
      ['Dinero ajeno máximo', function (x) { return mdp(x.max_ajeno); }, 'n'], ['Capital', function (x) { return mdp(x.capital) + avisoTope(x, true); }, 'n'],
      ['Banco, saldo máximo', function (x) { return mdp(x.banco_max); }, 'n'], ['Respaldo que faltaría', function (x) { return mdp(x.respaldo); }, 'n'],
      ['La norma', function (x) { var n = num(x.norma_alertas); return n === null ? '<span class="p2-tenue">—</span>' : (n > 0 ? chip(n + (n === 1 ? ' regla' : ' reglas') + ' sin cumplir', 'rojo') : chip('cumple', 'verde')); }],
      ['Costo del dinero', function (x) { return mdp(x.costo_dinero); }, 'n'], ['Obra', function (x) { return 'mes ' + esc(x.obra_inicio || '—') + ' a ' + esc(x.fin_obra || '—'); }, 'n'],
      ['Saldos desde el mes', function (x) { return esc(x.mes_saldos || '—'); }, 'n'], ['Revisión para fondos', function (x) { return esc(x.rv_resultado || '—'); }]
    ];
    var cab = '<tr><th></th>' + V.map(function (x) { return '<th class="n">V' + x.numero + ' · ' + esc(x.nombre || '') + '</th>'; }).join('') + '</tr>';
    var cuerpo = filas.map(function (f) {
      return '<tr' + (f[0] === 'El dueño recibe' ? ' class="fuerte"' : '') + '><td>' + esc(f[0]) + '</td>' + V.map(function (x) { return '<td class="' + (f[2] || '') + '" data-et="V' + x.numero + '">' + f[1](x) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var acciones = '<tr><td></td>' + V.map(function (x) {
      var b = '';
      var c = p.ciclo || {};
      if ((c.en_ronda || c.interrumpida) && c.trabajo === x.numero) return '<td class="n"><span class="p2-tenue p2-chico">en trabajo</span></td>';
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

  /* ───────── la voz del plan ───────── */
  function votosTxt(c) { return c.aprueban + ' de ' + c.votaron + ' aprueban' + (c.vetos > 0 ? ', con veto' : ''); }
  function voz() {
    var p = estado.plan, c = p.ciclo || {}, r = p.resumen || {}, puede = p.puede || {}, t = c.defiende, n = (p.rondas || []).length;
    if (!c.paso) return '';
    var texto = '', botones = '', nota = '', rv = String((ver(t) || {}).rv_resultado || ''), pasa = /^Pasa/.test(rv);
    // sólo prometo hacerlo solo si mi latido de verdad corre (el servidor dice cuándo fue el último)
    var solo = c.latido === 'activo' ? 'Si nadie me lo pide, lo hago solo en mi siguiente latido.'
      : (c.latido === 'apagado' ? 'Mi latido está apagado: sólo lo hago cuando alguien me lo pide.'
        : 'Todavía no tengo latido (nadie lo ha instalado, o lleva horas sin correr): sólo lo hago cuando alguien me lo pide.');
    var regresada = !!c.sesion && c.votaron === 7 && !c.aprobada;      // una sesión completa que no la aprobó
    var esBase = String((ver(t) || {}).estado || '') === 'base';
    switch (c.paso) {
      case 'datos': texto = 'Soy semilla: todavía no calculo. ' + (r['plan.para_crecer'] || ''); break;
      case 'explorar':
        texto = !pasa ? 'Mi V' + t + ' no pasa la revisión para fondos (' + rv.replace(/^No pasa: /, '') + '). Me toca mover capital y arranque de obra para buscar una que sí pase.'
          : (regresada ? 'El consejo regresó mi V' + t + ' (' + votosTxt(c) + '). Me toca mover capital y arranque de obra y volver con otra propuesta.'
            : (esBase ? 'Mi V' + t + ' es la base. Antes de probarla y defenderla me toca mover capital y arranque de obra para ver si hay algo mejor que proponer.'
              : 'Me toca mover capital y arranque de obra desde la V' + t + ' para ver si hay algo mejor que proponer.'));
        if (c.lugar && !c.lugar.version) {
          var presta = c.lugar.presta || [];
          texto += ' Pero no tengo una versión donde escribir: la base y la vigente no las toco, y no escribo encima del trabajo de una persona si nadie me lo presta.';
          nota = presta.length ? 'Si me prestas una, lo que tiene queda anotado en mi ronda antes de que yo escriba ahí.' : 'Descarta una versión (en «Versiones y reparto») para dejarme un lugar.';
          if (puede.editar) botones = presta.map(function (x) {
            return '<button class="p2-btn oro" data-accion="ronda" data-usar="' + x.version + '"><i class="ti ti-refresh" aria-hidden="true"></i> ' +
              (x.version === t ? 'Afinar la V' + x.version + ' en su lugar' : 'Prestarme la V' + x.version) + (x.nombre ? ' («' + esc(x.nombre) + '»)' : '') + '</button>';
          }).join(' ');
        } else {
          nota = solo;
          if (puede.editar) botones = '<button class="p2-btn oro" data-accion="ronda"><i class="ti ti-refresh" aria-hidden="true"></i> Correr mi ronda</button>';
        }
        break;
      case 'proponer':
        texto = 'Mi V' + t + ' no pasa la revisión para fondos (' + rv.replace(/^No pasa: /, '') + ') y, moviendo sólo capital y arranque de obra cerca de donde estoy, no encontré una que pase. ' +
          'Necesito que alguien arme conmigo una propuesta que pase: en «Versiones y reparto», mueve las otras palancas (banco, preventa, pagos durante la obra) o da un salto más grande.';
        if (n && estado.pestana !== 'rondas') botones = '<a class="p2-btn" href="#/plan/' + esc(estado.planId) + '/rondas">Ver lo que probé</a>';
        break;
      case 'probar':
        texto = 'Mi V' + t + ' todavía no se prueba con los números que tiene hoy. Me toca probarla contra los golpes.';
        nota = solo;
        if (puede.editar) botones = '<button class="p2-btn oro" data-accion="probar"><i class="ti ti-bolt" aria-hidden="true"></i> Probar mi V' + t + '</button>';
        break;
      case 'consejo':
        texto = c.sesion && c.votaron !== 7 ? 'La sesión ' + c.sesion + ' del consejo sobre mi V' + t + ' quedó incompleta: ' + c.votaron + ' votos, y deben votar los 7 jueces. Me toca presentarme otra vez.'
          : (c.sesion && !c.evidencia_sesion ? 'La sesión ' + c.sesion + ' del consejo no anotó la evidencia que había ese día, así que no sé contra qué juzgó mi V' + t + '. Me toca presentarla otra vez.'
            : (c.sesion ? 'Desde la sesión ' + c.sesion + ' cambió la evidencia (un candado, un dato confirmado, un hallazgo aceptado o una pregunta respondida). Me toca volver a presentar mi V' + t + ' al consejo.'
              : 'Ya corrí las pruebas de estrés de mi V' + t + ' con los números que tiene hoy. Me toca defenderla ante el consejo de planes.'));
        // el consejo corre en mi servidor, por la API de IA: con un botón, o solo en mi latido
        if (c.ia === 'listo') {
          nota = (c.consejo_solo ? 'Si nadie lo convoca, lo convoco solo en mi siguiente latido. ' : '') +
            'Los siete jueces votan por separado con los números de mi libro; tarda cerca de un minuto.';
          if (puede.editar) botones = '<button class="p2-btn oro" data-accion="consejo"><i class="ti ti-gavel" aria-hidden="true"></i> Convocar al consejo</button>';
        } else if (c.ia === 'apagado') nota = 'Mi consejo por API está apagado (renglón «consejo» = no en la hoja Config de mi servidor).';
        else nota = 'Mi consejo se convoca con un botón en cuanto Dirección ponga en mi servidor la clave de la API de IA.';
        break;
      case 'direccion':
        texto = 'El consejo aprobó mi V' + t + ' (' + votosTxt(c) + '). Falta que Dirección decida si queda vigente.';
        if (estado.version !== t) botones = '<button class="p2-btn" data-accion="version" data-v="' + t + '">Ver la V' + t + '</button>';
        break;
      case 'mundo':
        texto = 'El consejo regresó mi V' + t + ' (' + votosTxt(c) + ') y, moviendo capital y arranque de obra, ya no encontré mejora. Lo que falta lo tiene que conseguir alguien: lo pido en «Mis rondas». ' +
          'Cuando cambie la evidencia (un candado, un dato confirmado, un hallazgo aceptado o una pregunta respondida) vuelvo a presentarme.';
        if (estado.pestana !== 'rondas') botones = '<a class="p2-btn" href="#/plan/' + esc(estado.planId) + '/rondas">Ver lo que pido</a>';
        // lo que se puede avanzar con información pública (normativa, trámites, tasas, precios publicados) lo investigo en la web
        if (c.ia_busca && puede.editar) {
          botones = '<button class="p2-btn oro" data-accion="investigar-mundo"><i class="ti ti-world-search" aria-hidden="true"></i> Investigar lo que falta</button> ' + botones;
          nota = 'Lo que sólo puede entregar una persona (escrituras, cartas firmadas, presupuestos) no lo investigo: lo pido.';
        }
        break;
      case 'candados':
        var abiertos = Number(r['plan.candados_abiertos']) || 0;
        texto = 'Soy árbol: Dirección y el consejo ya eligieron mi V' + t + '. ' + ((p.candados || []).length
          ? 'Para florecer me falta cerrar ' + abiertos + (abiertos === 1 ? ' candado.' : ' candados.')
          : 'Para florecer necesito mis candados (tenencia, uso de suelo, agua, vialidad, banco y acuerdo con los dueños) y todavía no tengo ninguno anotado: hay que registrarlos en la pestaña Candados de mi libro.');
        break;
      case 'acuerdo': texto = 'Soy flor: todo está resuelto. Sólo falta firmar el acuerdo con el dueño.'; break;
      case 'cumplido': texto = 'Soy fruto: el acuerdo con el dueño está firmado.'; break;
      default: return '';
    }
    var i = CICLO.map(function (x) { return x[0]; }).indexOf(c.paso);
    var pasos = i < 0 ? '' : '<ol class="p2-ciclo" aria-label="Mi ciclo">' + CICLO.map(function (x, k) {
      return '<li class="' + (k === i ? 'ahora' : (k < i ? 'hecho' : '')) + '"' + (k === i ? ' aria-current="step"' : '') + '>' + esc(x[1]) + '</li>';
    }).join('') + '</ol>';
    return '<section class="p2-voz" aria-label="Lo que dice el plan"><div class="p2-sobre">' + esc(r['plan.nombre'] || 'El plan') + (n ? ' · ' + n + (n === 1 ? ' ronda' : ' rondas') : '') + '</div>' +
      '<p class="p2-dice">' + esc(texto) + '</p>' + pasos + (nota ? '<p class="p2-chico p2-tenue">' + esc(nota) + '</p>' : '') +
      (c.sin_leer ? '<p class="p2-chico p2-tenue">Hay ' + c.sin_leer + (c.sin_leer === 1 ? ' voto' : ' votos') + ' del consejo que no puedo leer: les falta la huella o la versión.</p>' : '') +
      (c.en_ronda ? '<p class="p2-chico p2-tenue">Estoy corriendo una ronda en este momento: las cifras de mi V' + c.trabajo + ' están a medias unos minutos.</p>' : '') +
      (c.interrumpida ? '<p class="p2-chico p2-tenue">Una ronda mía se interrumpió y las cifras de mi V' + c.trabajo + ' quedaron a medias. ' +
        (c.pausa ? 'Con la pausa puesta no puedo dejarla como estaba: lo hago en el primer cambio después de que se quite la pausa.'
          : 'En el siguiente cambio' + (c.latido === 'activo' ? ' (o en mi siguiente latido)' : '') + ' la dejo como estaba.') + '</p>' : '') +
      (botones ? '<div class="p2-acciones">' + botones + '</div>' : '') + '</section>';
  }

  /* pestaña: mis rondas (lo que el plan hace para salir adelante) */
  /* La última sesión del consejo sobre esa versión con esa huella: lo mismo que cuenta el libro (Plan!B31:B36). */
  function versionDe(x) { return Number(String(x.version === null || x.version === undefined ? '' : x.version).trim().slice(-1)) || 0; }
  /* Los votos se leen como los lee el libro: sin distinguir mayúsculas ni espacios de más («Aprueba », «CP-1 »). */
  function llano(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }
  function votoDe(x) { return llano(x.voto); }
  function sesionDe(huella, k) {
    var votos = (estado.plan.consejo || []).filter(function (x) { return huella && String(x.huella || '').trim() === huella && versionDe(x) === k; });
    if (!votos.length) return null;
    var ses = votos[votos.length - 1].sesion, suyos = votos.filter(function (x) { return llano(x.sesion) === llano(ses); });
    return { sesion: String(ses).trim(), aprueban: suyos.filter(function (x) { return votoDe(x) === 'aprueba'; }).length, total: suyos.length, veto: suyos.some(function (x) { return votoDe(x) === 'veto'; }) };
  }
  function huellaDe(k) { return ((estado.plan.versiones || [])[k - 1] || {}).huella || ''; }
  function pRondas() {
    var p = estado.plan, puede = p.puede || {}, c = p.ciclo || {};
    var golpe = {}, concepto = {};
    (c.golpes || []).forEach(function (g) { golpe[g.id] = g.nombre; });
    (p.palancas || []).forEach(function (x) { concepto[x.clave] = x.concepto; });
    // lo que pido: lo que no se arregla moviendo capital y arranque de obra
    var cond = (p.consejo || []).filter(function (x) { return c.sesion && llano(x.sesion) === llano(c.sesion) && x.condicion && String(x.huella || '').trim() === c.huella && versionDe(x) === c.defiende; }).map(function (x) {
      return '<li><div><b>' + esc(x.juez) + '</b><div class="p2-chico">' + esc(x.condicion) + '</div></div></li>';
    }).join('');
    var cand = (p.candados || []).filter(function (x) { return x.estado === 'abierto' || x.estado === 'en revisión'; }).map(function (x) {
      return '<li><div><b>' + esc(x.candado) + '</b> ' + chip(x.estado) + '<div class="p2-chico">' + esc(x.cierra || '') + '</div>' +
        (x.responsable ? '<div class="p2-quien">Responsable: ' + esc(x.responsable) + '</div>' : '') + '</div></li>';
    }).join('');
    var pido = (cond || cand) ? '<section class="p2-seccion"><h2>Lo que pido</h2><p class="p2-tenue">Lo que no puedo resolver moviendo capital y arranque de obra: alguien tiene que conseguirlo.</p>' +
      (cond ? '<div class="p2-panel"><h3>Lo que pidió el consejo (' + esc(c.sesion) + ') para aprobar mi V' + c.defiende + '</h3><ul class="p2-lista">' + cond + '</ul></div>' : '') +
      (cand ? '<div class="p2-panel"><h3>Candados abiertos</h3><ul class="p2-lista">' + cand + '</ul></div>' : '') + '</section>' : '';
    // mis rondas
    var rondas = (p.rondas || []).slice().reverse().map(function (x) {
      var det = x.detalle || {}, cs = (det.candidatos || []).slice().sort(function (a, b) { return (a.p.obra_inicio - b.p.obra_inicio) || (a.p.capital - b.p.capital); });
      var filas = cs.map(function (k) {
        // el peor de los golpes leves, cada uno por separado: es una cifra del libro, aquí no se suma nada
        var g = k.golpes, peor = '', falt = null;
        if (g) { falt = 0; Object.keys(g).forEach(function (id) { if (num(g[id].r) > falt) { falt = g[id].r; peor = id; } }); }
        return '<tr class="' + (k.elegido && !k.base ? 'elegida' : '') + '"><td data-et="Capital">' + mdpCorto(k.p.capital) + (k.base ? ' <span class="p2-tenue">· de partida</span>' : '') +
          (k.elegido && !k.base ? ' <span class="p2-tenue">· la que propongo</span>' : '') + (k.cerca ? ' <span class="p2-tenue">· la más cercana</span>' : '') +
          (k.retirada ? ' <span class="p2-tenue">· ya la propuse' + (num(k.retirada) ? ' (ronda ' + k.retirada + ')' : '') + ' y se retiró</span>' : '') + '</td>' +
          '<td class="n" data-et="Arranque de obra">mes ' + esc(k.p.obra_inicio) + '</td><td data-et="Revisión para fondos">' + esc(k.rv || '—') + '</td>' +
          '<td class="n" data-et="Al dueño">' + mdpCorto(k.d) + '</td><td class="n" data-et="Meses">' + (num(k.m) === null ? '—' : k.m) + '</td>' +
          '<td data-et="Con el peor golpe leve faltaría">' + (falt === null ? '<span class="p2-tenue">' + (k.f === 0 ? 'no hizo falta probarla' : 'no pasa: no se prueba') + '</span>' : (falt > 0 ? mdpCorto(falt) + ' <span class="p2-tenue">· ' + esc((golpe[peor] || peor).toLowerCase()) + '</span>' : 'nada')) + '</td></tr>';
      }).join('');
      var kv = Number(x.version), ses = x.resultado === 'propuesta' ? sesionDe(x.huella, kv) : null, viva = x.resultado === 'propuesta' && x.huella && x.huella === huellaDe(kv);
      var consejo = x.resultado !== 'propuesta' ? '' : (ses ? '<p class="p2-chico"><b>Consejo (' + esc(ses.sesion) + '):</b> ' + ses.aprueban + ' de ' + ses.total + ' aprueban' + (ses.veto ? ', con veto' : '') + (ses.total !== 7 ? ' · sesión incompleta' : '') + '.</p>'
        : '<p class="p2-chico p2-tenue">' + (viva ? 'Esta propuesta todavía no pasa por el consejo.' : 'Esta propuesta ya cambió después de esta ronda.') + '</p>');
      var a = det.antes, tenia = '';
      if (a && (a.nombre || a.estado)) {
        var fijas = (a.celdas || []).filter(function (z) { return !z[1] && z[2] !== '' && z[2] !== null; }).map(function (z) { return '<li>' + esc(concepto[z[0]] || z[0]) + ': <b>' + esc(z[2]) + '</b></li>'; }).join('');
        tenia = '<details><summary>Lo que tenía la V' + esc(a.version) + ' antes de esta ronda: «' + esc(a.nombre || 'sin nombre') + '» (' + esc(a.estado || 'sin estado') + ')</summary>' +
          '<p class="p2-chico p2-tenue">' + (a.propuesta_por ? 'La propuso: ' + esc(a.propuesta_por) + '. ' : '') + 'Sus palancas propias (lo demás lo tomaba de los datos):</p><ul class="p2-chico">' + (fijas || '<li>ninguna</li>') + '</ul></details>';
      }
      return '<div class="p2-panel"><h3>Ronda ' + esc(x.n) + ' · ' + chip(x.resultado === 'propuesta' ? 'propuse la V' + x.version : 'sin mejora', x.resultado === 'propuesta' ? 'azul' : 'gris') + '</h3>' +
        '<div class="p2-quien">' + esc(x.fecha) + ' · ' + esc(x.quien) + (x.motivo ? ' · ' + esc(x.motivo) : '') + '</div>' +
        '<p>' + esc(x.que_cambia || '') + '</p>' + consejo + tenia +
        (filas ? '<details><summary>Lo que probé: ' + cs.length + (cs.length === 1 ? ' combinación' : ' combinaciones') + '</summary><div class="p2-envoltura"><table class="p2-tabla tarjetas"><thead><tr><th>Capital</th><th class="n">Arranque de obra</th><th>Revisión para fondos</th><th class="n">Al dueño</th><th class="n">Meses</th><th>Con el peor golpe leve faltaría</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
          '<p class="p2-chico p2-tenue">Sólo propongo lo que pasa la revisión para fondos. Entre las que pasan va primero la que aguanta los golpes leves, cada uno por separado (' +
          esc((c.golpes || []).map(function (g) { return g.nombre.toLowerCase(); }).join(', ')) + '): que con ninguno le falte dinero. Si ninguna aguanta, cuenta el peor golpe: gana la que le quita a la de partida al menos un paso entero de capital' +
          (num(det.paso_capital) ? ' (' + mdpCorto(det.paso_capital) + ' MDP)' : '') + ' de faltante; quitarle menos no cuenta, y una a la que le falta más nunca le gana. ' +
          'Después, la que pasa sin quedar justa, la que no le alarga el plazo al dueño, la que usa menos capital y la que más le deja (a décimas de MDP).</p></details>' : '') + '</div>';
    }).join('');
    var hall = (p.hallazgos || []).slice().reverse().map(function (h) {
      return '<li><div><b>' + esc(h.tema) + '</b> ' + chip(h.estado) + ' ' + chip('confianza ' + (h.confianza || '—'), 'gris') + '<div>' + esc(h.hallazgo) + '</div>' +
        '<div class="p2-quien">' + esc(h.fecha) + ' · ' + esc(h.quien) + (h.fuente ? ' · Fuente: ' + (/^https?:\/\//.test(h.fuente) ? '<a href="' + esc(h.fuente) + '" target="_blank" rel="noopener">' + esc(h.fuente) + '</a>' : esc(h.fuente)) : '') + '</div></div>' +
        (puede.editar && h.estado === 'propuesto' ? '<div class="p2-acciones"><button class="p2-btn verde" data-accion="hallazgo" data-fila="' + h.fila + '" data-estado="aceptado">Aceptar</button><button class="p2-btn suave" data-accion="hallazgo" data-fila="' + h.fila + '" data-estado="descartado">Descartar</button></div>' : '') + '</li>';
    }).join('');
    var investigando = (p.preguntas || []).filter(function (q) { return q.estado === 'investigando'; }).map(function (q) { return '<li><div>' + esc(q.texto) + '</div>' + chip('investigando') + '</li>'; }).join('');
    // cómo aguanto: la última corrida de la versión que se está viendo
    var suyas = (p.pruebas || []).filter(function (x) { return x.version === 'V' + estado.version; }), ultima = suyas.length ? suyas[suyas.length - 1].fecha : '';
    var corrida = suyas.filter(function (x) { return x.fecha === ultima; }), alDia = corrida.length && corrida[0].huella && corrida[0].huella === huellaDe(estado.version);
    var tabla = corrida.map(function (x) {
      return '<tr><td data-et="Escenario">' + esc(x.escenario) + '</td><td class="n" data-et="Banco">' + mdpCorto(x.banco_max) + '</td><td class="n" data-et="Faltaría">' + mdpCorto(x.respaldo) + '</td><td class="n" data-et="Costo del dinero">' + mdpCorto(x.costo_dinero) + '</td><td class="n" data-et="Ganancia">' + mdpCorto(x.ganancia) + '</td><td class="n" data-et="Reparto">' + esc(x.mes_reparto) + '</td></tr>';
    }).join('');
    var sesiones = {};
    (p.consejo || []).forEach(function (x) { var k = String(x.sesion || '').trim().toUpperCase() + ' · V' + (versionDe(x) || '?') + '\u0000' + String(x.huella || '').trim(); (sesiones[k] = sesiones[k] || []).push(x); });
    var consejo = Object.keys(sesiones).reverse().map(function (k) {
      var votos = sesiones[k], si = votos.filter(function (x) { return votoDe(x) === 'aprueba'; }).length, veto = votos.some(function (x) { return votoDe(x) === 'veto'; });
      var kv = versionDe(votos[0]), hv = String(votos[0].huella || '').trim(), vieja = !(hv && hv === huellaDe(kv));
      var jueces = {};
      votos.forEach(function (x) { jueces[llano(x.juez)] = 1; });
      var repetido = Object.keys(jueces).length < votos.length;
      return '<div class="p2-panel"><h3>Sesión ' + esc((votos[0].fecha ? votos[0].fecha + ' · ' : '') + k.split('\u0000')[0]) + ' · ' + si + ' de ' + votos.length + ' aprueban' + (veto ? ' · con veto' : '') + '</h3>' +
        (!hv || !kv ? '<p class="p2-chico p2-tenue">A estos votos les falta la huella o la versión: no los puedo contar.</p>'
          : (vieja ? '<p class="p2-chico p2-tenue">Votaron sobre números que esta versión ya no tiene: estos votos ya no cuentan.</p>'
            : (votos.length !== 7 ? '<p class="p2-chico p2-tenue">Sesión incompleta: deben votar los 7 jueces para que cuente.</p>'
              : (repetido ? '<p class="p2-chico p2-tenue">Un juez aparece más de una vez. Mi libro cuenta renglones, no jueces: esta sesión hay que rehacerla con los siete, uno por juez.</p>' : '')))) + '<ul class="p2-lista">' +
        votos.map(function (x) { return '<li><div><b>' + esc(x.juez) + '</b> ' + chip(votoDe(x)) + '<div class="p2-chico">' + esc(x.razon) + '</div>' + (x.condicion ? '<div class="p2-chico p2-tenue">Para aprobar: ' + esc(x.condicion) + '</div>' : '') + '</div></li>'; }).join('') + '</ul></div>';
    }).join('');
    return pido +
      '<section class="p2-seccion"><h2>Mis rondas</h2><p class="p2-tenue">Cuando el consejo me regresa una versión, o cuando la que defiendo no pasa la revisión para fondos, muevo capital y arranque de obra en una versión de trabajo, ' +
      'mi libro recalcula cada combinación y propongo sólo lo que pasa la revisión. La base y la vigente no las toco, ni escribo encima del trabajo de una persona si nadie me lo presta; sólo Dirección vuelve vigente una versión.</p>' +
      (rondas || '<div class="p2-vacio">Todavía no corro ninguna ronda.</div>') + '</section>' +
      '<section class="p2-seccion"><h2>Cómo aguanto los golpes</h2><p class="p2-tenue">Mi libro recalcula cada escenario en su columna de prueba y la deja como estaba. ' +
      (ultima ? 'Última corrida sobre la V' + estado.version + ': ' + esc(ultima) + '.' : '') + '</p>' +
      (tabla && !alDia ? '<p class="p2-chico p2-tenue">Estas pruebas son de antes de que cambiaran los números de esta versión.</p>' : '') +
      (puede.editar ? '<p><button class="p2-btn' + (tabla && alDia ? ' suave' : ' oro') + '" data-accion="estres"><i class="ti ti-bolt"></i> Correr pruebas sobre la V' + estado.version + '</button></p>' : '') +
      (tabla ? '<div class="p2-panel p2-envoltura"><table class="p2-tabla tarjetas"><thead><tr><th>Escenario</th><th class="n">Banco máx.</th><th class="n">Faltaría</th><th class="n">Costo del dinero</th><th class="n">Ganancia real</th><th class="n">Mes de reparto</th></tr></thead><tbody>' + tabla + '</tbody></table></div>' : '<div class="p2-vacio">Todavía no me pruebo con la V' + estado.version + '.</div>') + '</section>' +
      '<section class="p2-seccion"><h2>Cómo me defendí ante el consejo</h2><p class="p2-tenue">Siete jueces del oficio revisan cada versión antes de que Dirección decida: aprueba con 5 de 7 y un candado puede vetar. Cada voto vale para los números que juzgó: si la versión cambia, deja de contar.</p>' + (consejo || '<div class="p2-vacio">Todavía no me presento ante el consejo.</div>') + '</section>' +
      '<section class="p2-seccion"><h2>Lo que encontré</h2><p class="p2-tenue">Lo que investigo o encuentra el equipo. Nada de esto cambia un dato hasta que alguien lo acepta.</p>' +
      '<div class="p2-panel"><ul class="p2-lista">' + (hall || '<li>Todavía no hay hallazgos.</li>') + '</ul></div>' +
      (investigando ? '<div class="p2-panel"><h3>Lo que estoy investigando</h3><ul class="p2-lista">' + investigando + '</ul></div>' : '') + '</section>';
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
  var focoPrevio = null;      // al cerrar un diálogo, el foco vuelve a lo que lo abrió (el lápiz de un cuadro, por ejemplo)
  function abrirDialogo(html) {
    var previo = document.activeElement;
    cerrarDialogo(true);
    focoPrevio = previo;
    var d = document.createElement('div');
    d.className = 'p2-dialogo'; d.id = 'p2Dialogo';
    d.innerHTML = '<div class="p2-caja" role="dialog" aria-modal="true">' + html + '</div>';
    var titulo = d.querySelector('h2');
    if (titulo) { titulo.id = 'p2DialogoTitulo'; d.firstChild.setAttribute('aria-labelledby', 'p2DialogoTitulo'); }
    // en <body> y después de la hoja del cuadro: no se anuncia como región viva y queda encima de todo
    document.body.appendChild(d);
    var vz = document.getElementById('vzModal');
    if (vz && !vz.hidden) { vz.inert = true; vz.setAttribute('data-p2-inerte', '1'); }
    var primero = d.querySelector('input,textarea,select,button');
    if (primero) primero.focus();
  }
  function cerrarDialogo(paraOtro) {
    var d = document.getElementById('p2Dialogo');
    if (!d) return;
    d.remove();
    lapiz.marca = null;
    var vz = document.querySelector('[data-p2-inerte]');
    if (vz) { vz.inert = false; vz.removeAttribute('data-p2-inerte'); }
    if (focoPrevio && document.contains(focoPrevio) && focoPrevio.focus) { try { focoPrevio.focus({ preventScroll: true }); } catch (e) { } }
    focoPrevio = null;
    // si el libro cambió mientras se probaba una cifra, se trae lo último ahora que ya no hay diálogo encima
    if (!paraOtro && lapiz.recargar) { lapiz.recargar = false; if (estado.planId) cargarPlan(true); }
  }

  function enviar(cuerpo, mensaje, ms, espera) {
    if (estado.ocupado) return Promise.resolve();
    if (estado.planId && estado.fresco === false) {     // lo que se ve es lo último que vi: no se guarda nada encima
      toast(estado.sinRed ? 'No tengo conexión con mi servidor: no guardo cambios hasta traer lo último de mi libro.' : 'Un momento: estoy trayendo lo último de mi libro. Vuelve a intentarlo en unos segundos.');
      return Promise.resolve({ ok: false, error: 'fresco' });
    }
    estado.ocupado = true;
    var t = token();
    if (estado.plan && !cuerpo.plan) { cuerpo.plan = estado.planId; cuerpo.rev = estado.plan.rev; }
    // lo que tarda (las pruebas de estrés: el libro recalcula cada escenario) deja el aviso puesto hasta terminar
    if (ms > 60000) toast(espera || 'Corriendo en el libro… tarda cerca de un minuto; no cierres la página.', true);
    else toast('Guardando en el libro…');
    return escribir(cuerpo, ms).then(function (r) {
      estado.ocupado = false;
      if (!r || !r.ok) {
        var e = (r && r.error) || 'red';
        if (RECHAZOS.indexOf(e) >= 0) {        // la sesión ya no sirve: el aviso de «estoy trabajando» se quita y queda la pantalla de entrar
          var av = document.getElementById('p2Toast');
          if (av) av.hidden = true;
          olvidaTodo();
          fallo(r); return r;
        }
        toast(r && r.recuperado ? 'Una ronda mía había quedado a medias: ya dejé la versión como estaba y no hice tu cambio. Revisa las cifras y vuelve a intentarlo.' : (ERRORES[e] || 'No se pudo guardar.') + codigosAPI(r), !!(r && r.recuperado) || FIJOS.indexOf(e) >= 0);
        if ((e === 'revision' || e === 'sin_lugar' || e === 'paso' || e === 'cambio') && estado.planId) cargarPlan(true);
        return r;
      }
      toast((r && r.nota) || mensaje || 'Guardado: el libro recalculó.', !!(r && r.nota));
      cerrarDialogo();
      if (cuerpo.tipo === 'ppp2-sembrar') { olvida('vivero', ''); estado.vivero = null; location.hash = '#/plan/' + r.plan_id; return r; }
      if (estado.planId) {
        estado.vivero = null; olvida('vivero', '');
        // la respuesta trae el plan ya leído: se pinta sin volver a pedirlo
        if (r.plan && r.plan.ok === true && r.plan.plan_id === estado.planId) {
          memoriza('plan', estado.planId, r.plan, t);
          estado.plan = r.plan; estado.fresco = true; estado.sinRed = false;
          pintarPlan();
          return r;
        }
        return cargarPlan(true).then(function () { return r; });
      }
      return r;
    }, function () { estado.ocupado = false; toast('Sin respuesta del servidor; tu cambio puede no haberse guardado. Recarga para revisar.', true); });
  }

  /* Tras un intento fallido el plan se vuelve a pintar (el botón no se queda «corriendo»), salvo que la sesión
     ya no sirva: ahí se queda la pantalla de entrar. */
  function repinta(r) {
    if (r && RECHAZOS.indexOf(r.error) >= 0) return;
    if (estado.plan && estado.planId) pintarPlan();
  }

  function editarDato(claveDato) {
    var d = (estado.plan.datos || []).filter(function (x) { return x.clave === claveDato; })[0];
    if (!d) return;
    var opciones = estado.plan.resumen.esquema === 'ppp-libro-v3' ? window.PPPUnico.opciones(claveDato, estado.plan.resumen) : null;
    var esNumero = NUMERICAS.indexOf(d.unidad) >= 0;
    var mostrado = d.unidad === '%' && num(d.valor) !== null ? Math.round(d.valor * 10000) / 100 : d.valor;
    abrirDialogo('<h2>' + esc(d.concepto) + '</h2><form class="p2-form" data-form="dato" data-clave="' + esc(d.clave) + '" data-unidad="' + esc(d.unidad) + '">' +
      '<label>Valor ' + (d.unidad && d.unidad !== 'texto' ? '(' + esc(d.unidad === '%' ? '% · escribe 30 para 30%' : d.unidad) + ')' : '') +
      (opciones ? '<select name="valor">' + opciones.map(function (x) { return '<option' + (x === d.valor ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' : esNumero ? '<input name="valor" inputmode="decimal" value="' + esc(mostrado == null ? '' : mostrado) + '">' : '<textarea name="valor" rows="2">' + esc(d.valor || '') + '</textarea>') + '</label>' +
      '<label>Estado<select name="estado">' + ['confirmado', 'supuesto', 'por confirmar', 'en conflicto', 'derivado', 'falta'].map(function (e) { return '<option' + (e === (d.estado || (estado.plan.resumen.esquema === 'ppp-libro-v3' ? 'por confirmar' : 'confirmado')) ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></label>' +
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
    if (!b || !raiz.contains(b) && !b.closest('.p2-dialogo') && !b.closest('#vzModal')) return;
    var a = b.getAttribute('data-accion');
    if (a === 'grupo-factor') { estado.factores = b.getAttribute('data-c'); estado.buscaFactor = ''; var busca = document.querySelector('[data-busca-factor]'); if (busca) busca.value = ''; refrescaFactores(); return; }
    if (a === 'factor-switch') { var f = b.closest('form'), activo = b.getAttribute('aria-checked') !== 'true'; f.valor.value = activo ? '1' : '0'; b.setAttribute('aria-checked', String(activo)); b.querySelector('b').textContent = activo ? 'Sí' : 'No'; limpiaPrueba(); return; }
    if (a === 'lapiz') { abrirLapiz(b.getAttribute('data-e')); return; }
    if (a === 'abrir-cuadro') { var cu = document.querySelector('#p2Cuadros .vz-card[data-card="' + b.getAttribute('data-c') + '"]'); if (cu) cu.click(); return; }
    if (a === 'lapiz-probar') { probarLapiz(b); return; }
    if (a === 'ir') {
      var adonde = b.getAttribute('data-a');
      cierraHojaY(function () {
        location.hash = '#/plan/' + estado.planId + '/' + adonde;
        setTimeout(function () { var el = document.getElementById('p2Pestana'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }, 60);
      });
      return;
    }
    if (a === 'entrar') { if (window.YODPortero && window.YODPortero.entrar) window.YODPortero.entrar(); else location.reload(); return; }
    if (a === 'reintentar') { estado.vivero = null; ruta(); return; }
    if (a === 'refrescar') {
      if (estado.planId) { estado.sinRed = false; pintarPlan(); cargarPlan(true); }
      else { estado.vivero = null; estado.viveroCopia = null; cargarVivero(); }
      return;
    }
    if (a === 'cerrar') { cerrarDialogo(); return; }
    if (a === 'compartir') { dialogoCompartir(); return; }
    if (a === 'liga-copiar') { copiarLiga(b.getAttribute('data-liga')); return; }
    if (a === 'liga-estado') { ligaAccion({ op: b.getAttribute('data-op'), liga: b.getAttribute('data-liga') }, function () { dialogoCompartir(); }); return; }
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
    if (a === 'ronda') {
      if (estado.ocupado) return;
      b.disabled = true;
      b.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Corriendo mi ronda…';
      var cuerpo = { tipo: 'ppp2-ronda' }, usar = Number(b.getAttribute('data-usar'));
      if (usar) cuerpo.usar = usar;                 // una persona le presta esa versión al plan
      enviar(cuerpo, 'Ronda lista.', 330000, 'Estoy moviendo capital y arranque de obra: mi libro recalcula cada combinación. Tarda unos minutos; no cierres la página.').then(function (r) {
        if (!r || !r.ok) { repinta(r); return; }      // el botón no se queda «corriendo»
        if (r.resultado !== 'propuesta') { toast('Moví capital y arranque de obra y no encontré nada mejor que proponer. Lo anoté en «Mis rondas».'); return; }
        estado.version = r.version;
        return enviar({ tipo: 'ppp2-estres', version: r.version }, 'Propuesta lista y probada: ahora le toca al consejo.', 300000,
          'Ya tengo propuesta en la V' + r.version + '. Ahora la pruebo contra los golpes; tarda cerca de un minuto.')
          .then(function (r2) { if (!r2 || !r2.ok) repinta(r2); });
      });
      return;
    }
    if (a === 'probar') {
      if (estado.ocupado) return;
      var t = (estado.plan.ciclo || {}).defiende;
      b.disabled = true;
      estado.version = t || estado.version;
      b.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Probándome…';
      enviar({ tipo: 'ppp2-estres', version: t }, 'Pruebas listas: ahora le toca al consejo.', 300000, 'Me estoy probando contra los golpes; tarda cerca de un minuto. No cierres la página.')
        .then(function (r) { if (!r || !r.ok) repinta(r); });
      return;
    }
    if (a === 'consejo') {
      if (estado.ocupado) return;
      b.disabled = true;
      b.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Votando los siete jueces…';
      enviar({ tipo: 'ppp2-consejo' }, 'El consejo ya votó.', 300000,
        'Convoqué a los siete jueces: cada uno revisa por separado los números de mi libro. Tarda cerca de un minuto; no cierres la página.')
        .then(function (r) { if (!r || !r.ok) repinta(r); });
      return;
    }
    if (a === 'investigar-mundo') {
      if (estado.ocupado) return;
      b.disabled = true;
      b.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Investigando…';
      enviar({ tipo: 'ppp2-investigar', mundo: true }, 'Investigación lista.', 300000,
        'Estoy investigando en la web lo que se puede avanzar con información pública. Tarda cerca de un minuto; no cierres la página.')
        .then(function (r) { if (!r || !r.ok) repinta(r); });
      return;
    }
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
      var busca = !!(estado.plan.ciclo || {}).ia_busca;      // con la clave de la API investigo ahí mismo; sin ella, queda pedido
      enviar({ tipo: 'ppp2-investigar', pregunta: q, tema: preg.texto || q, detalle: (document.querySelector('[data-respuesta="' + q + '"]') || {}).value || '' }, 'Quedó pedido.',
        busca ? 300000 : 0, 'Estoy investigando en la web; tarda cerca de un minuto. No cierres la página.');
    }
  });

  document.addEventListener('change', function (ev) {
    if (ev.target.matches && ev.target.matches('#p2Dialogo input[name="donde"]')) { dondeCambia(); return; }
    var i = ev.target.closest('input[data-palanca]');
    if (!i) return;
    var unidad = i.getAttribute('data-unidad'), n = aNumero(i.value, unidad);
    if (n === null || isNaN(n)) { toast('Escribe un número.'); return; }
    enviar({ tipo: 'ppp2-palanca', version: Number(i.getAttribute('data-v')), clave: i.getAttribute('data-palanca'), valor: n });
  });

  // cambiar la cifra borra el resultado de la prueba anterior: lo que se ve siempre es de la cifra escrita
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!t.matches) return;
    if (t.matches('[data-busca-factor]')) { estado.buscaFactor = t.value; refrescaFactores(); return; }
    if (t.matches('#p2Dialogo [data-factor-slider]')) { t.closest('form').valor.value = t.value; limpiaPrueba(); return; }
    if (t.matches('#p2Dialogo form[data-form="lapiz"] input[name="valor"]')) {
      var f = t.closest('form'), s = f.querySelector('[data-factor-slider]'), b = f.querySelector('[data-accion="factor-switch"]'), n = aNumero(t.value, 'MDP');
      if (s && n !== null && !isNaN(n)) { if (n < Number(s.min)) s.min = n; if (n > Number(s.max)) s.max = n; s.value = n; }
      if (b) { b.setAttribute('aria-checked', String(n === 1)); b.querySelector('b').textContent = n === 1 ? 'Sí' : 'No'; }
      limpiaPrueba();
    }
  });

  document.addEventListener('submit', function (ev) {
    var f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    var tipo = f.getAttribute('data-form'), d = new FormData(f);
    if (tipo === 'sembrar') {
      var m2 = aNumero(d.get('terreno_m2'), 'm²');
      var firma = JSON.stringify([d.get('nombre'),d.get('ubicacion'),d.get('tipo'),d.get('objetivo'),m2]);
      if (f.pppFirma !== firma) { f.pppFirma = firma; f.pppSolicitud = rid(); }
      enviar({ tipo: 'ppp2-sembrar', request_id: f.pppSolicitud, nombre: d.get('nombre'), ubicacion: d.get('ubicacion'), tipo_proyecto: d.get('tipo'), objetivo: d.get('objetivo'), terreno_m2: isNaN(m2) ? '' : m2, fuente: 'Captura inicial en el PPP' }, 'Plan creado en Sheets.');
      return;
    }
    if (tipo === 'dato') {
      var unidad = f.getAttribute('data-unidad'), crudo = d.get('valor'), valor = crudo;
      if (NUMERICAS.indexOf(unidad) >= 0) { valor = aNumero(crudo, unidad); if (valor === null) valor = ''; if (isNaN(valor)) { toast('Escribe un número.'); return; } }
      enviar({ tipo: 'ppp2-dato', clave: f.getAttribute('data-clave'), valor: valor, estado: d.get('estado'), fuente: d.get('fuente') });
      return;
    }
    if (tipo === 'liga') {
      var planes = d.getAll('otro').map(function (id) { return { plan: id }; });
      ligaAccion({ op: 'crear', para: d.get('para'), versiones: d.get('versiones'), planes: planes }, function (r) { dialogoCompartir(r.liga); toast('Liga creada.'); });
      return;
    }
    if (tipo === 'candado') { enviar({ tipo: 'ppp2-candado', id: f.getAttribute('data-id'), estado: d.get('estado'), evidencia: d.get('evidencia') }); return; }
    if (tipo === 'lapiz') { guardarLapiz(f); return; }
    if (tipo === 'producto') {
      var campos = {}, previo = (lapiz.previo || {}).campos || {}, mal = false;
      ['unidades', 'm2', 'precio_m2'].forEach(function (c) {
        var n = aNumero(d.get(c), c === 'm2' ? 'm²' : '');
        if (n === null) return;
        if (isNaN(n) || n < 0) { mal = true; return; }
        if (n !== previo[c]) campos[c] = n;
      });
      if (mal) { toast('Escribe números positivos.'); return; }
      if (d.get('estado') !== previo.estado) campos.estado = d.get('estado');
      if (d.get('uso') !== null && String(d.get('uso')) !== String(previo.uso || '')) campos.uso = d.get('uso');
      if (String(d.get('fuente') || '') !== String(previo.fuente || '')) campos.fuente = d.get('fuente');
      if (!Object.keys(campos).length) { cerrarDialogo(); return; }
      var atras = {};
      Object.keys(campos).forEach(function (c) { atras[c] = previo[c] === undefined || previo[c] === null ? '' : previo[c]; });
      var fila = Number(f.getAttribute('data-fila')), nom = ((estado.plan.productos || [])[fila - 1] || {}).nombre || 'Producto';
      enviar({ tipo: 'ppp2-producto', fila: fila, campos: campos }, 'Guardado: el libro recalculó las ventas.').then(function (r) {
        if (r && r.ok) ofrecerDeshacer(nom + ': ' + Object.keys(campos).join(', '), { tipo: 'ppp2-producto', fila: fila, campos: atras }, r);
      });
      return;
    }
    if (tipo === 'esquema') {
      var nuevo = Number(d.get('esquema')), antes = (lapiz.previo || {}).esquema;
      if (!nuevo || nuevo === antes) { cerrarDialogo(); return; }
      enviar({ tipo: 'ppp2-reparto', esquema: nuevo }, 'Esquema elegido: el libro recalculó lo que recibe cada parte.').then(function (r) {
        if (r && r.ok && antes) ofrecerDeshacer('Esquema de reparto', { tipo: 'ppp2-reparto', esquema: antes }, r);
      });
      return;
    }
    if (tipo === 'aprobar') { enviar({ tipo: 'ppp2-version', version: Number(f.getAttribute('data-v')), campos: { estado: 'vigente' }, razon: d.get('razon') }, 'Versión vigente aprobada.'); }
  });

  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') cerrarDialogo(); });
  /* Un diálogo abierto encima de la hoja de un cuadro: Esc cierra sólo el diálogo y el foco no se va a la hoja de atrás. */
  document.addEventListener('keydown', function (ev) {
    var dlg = document.getElementById('p2Dialogo');
    if (!dlg) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); cerrarDialogo(); return; }
    if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('form[data-form="lapiz"] input[name="valor"]')) {
      // Enter en la cifra la prueba; guardar es siempre un toque en «Guardar»
      ev.preventDefault(); ev.stopPropagation();
      var pb = dlg.querySelector('[data-accion="lapiz-probar"]');
      if (pb && !pb.hidden && !pb.disabled) probarLapiz(pb);
      else { var g = dlg.querySelector('button[type="submit"]'); if (g) g.focus(); }
      return;
    }
    if (ev.key !== 'Tab') return;
    ev.stopPropagation();
    var f = Array.prototype.filter.call(dlg.querySelectorAll('button, [href], input, select, textarea'), function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!f.length) return;
    var i = f.indexOf(document.activeElement);
    if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && (i < 0 || i === f.length - 1)) { ev.preventDefault(); f[0].focus(); }
  }, true);
  /* Si el Portero rechaza la sesión (lo avisa el cargador), lo que vi se borra y, si estaba a la vista, se pide entrar. */
  window.addEventListener('yodcargador:sesion-rechazada', function () {
    olvidaTodo();
    if ((estado.planId && estado.fresco === false) || (!estado.planId && estado.viveroCopia)) fallo({ error: 'liga' });
  });
  window.addEventListener('yodcargador:sesion-cerrada', olvidaTodo);
  window.addEventListener('hashchange', ruta);
  window.PPP2 = { estado: estado, recargar: function () { estado.vivero = null; estado.plan = null; ruta(); } };
  ruta();
})();
