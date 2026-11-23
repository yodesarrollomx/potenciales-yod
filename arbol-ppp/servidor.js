/* Árbol PPP · puente con el libro. Con la sesión del Portero que ya está en el navegador, pide al servidor del PPP 2 la definición
   publicada del árbol, guarda el plan como una columna en Borrador y abre los planes que el árbol guardó.
   - Sin sesión, con el árbol apagado en el servidor o sin red, la pantalla trabaja con la definición de la página y NO guarda en el libro: lo dice.
   - No calcula nada: la columna la arma conexion.js y las cifras el motor. Nunca borra la credencial del Portero.
   - La dirección del servidor es la misma de ppp2.js (una prueba las compara). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root); else root.ArbolServidor = factory(root);
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbywqwBh7uiD6DLmpTD6OUhzBX-AhkNxePhYgjn5Up3vAYdBzbV-2JyE7a5kKF_2QnO4/exec';
  var LLAVE = 'pyod_clave_v1', CLAVE_PLAN = 'ppp-arbol-pantalla-2', CLAVE_CMP = 'ppp-arbol-comparacion-1', CLAVE_ORIGEN = 'ppp-arbol-libro-1';
  var TEXTOS = {
    apagado: 'El árbol todavía no está conectado al libro. Puedes armar el plan aquí; no se guarda en el libro.',
    sin_sesion: 'No hay sesión de YOD OS en este navegador. Puedes armar el plan aquí; no se guarda en el libro.',
    liga: 'Tu sesión ya no es válida. Entra de nuevo a YOD OS para guardar en el libro.',
    expirado: 'Tu sesión venció. Entra de nuevo a YOD OS para guardar en el libro.',
    revocado: 'Tu sesión ya no es válida. Entra de nuevo a YOD OS para guardar en el libro.',
    board: 'Tu acceso no incluye Potenciales: no puedes guardar en el libro.',
    portero: 'No pude validar tu sesión en este momento. Intenta de nuevo en un minuto.',
    permiso: 'Tu acceso es de lectura: no puedes guardar en el libro.',
    pausa: 'El servidor está en pausa (solo lectura). No se guardó nada.',
    ocupado: 'El libro está ocupado con otro guardado. Intenta de nuevo en unos segundos.',
    revision: 'Alguien cambió ese plan en el libro después de que lo abriste. No lo pisé. Ábrelo de nuevo o guárdalo como plan nuevo.',
    columna_ajena: 'Esa columna ya no es un borrador del árbol (alguien la cambió o la volvió vigente). Guárdalo como plan nuevo.',
    columna_invalida: 'No encontré esa columna en el libro.',
    sin_columnas: 'El libro ya no tiene columnas libres. No se guardó nada; avisa a Dirección.',
    sin_libro: 'Al servidor le falta saber cuál es el libro. Avisa a Dirección.',
    sin_hoja: 'El libro no tiene la hoja de planes. Avisa a Dirección.',
    pestanas: 'Al libro le faltan pestañas de la definición del árbol. Avisa a Dirección.',
    id_desconocido: 'El libro no tiene uno de los factores del árbol. No se guardó nada; avisa a Dirección.',
    verificacion: 'Se escribió, pero al leer de vuelta algo no coincidió. Revisa esa columna en el libro.',
    incompleto: 'La escritura se cortó a medias. Revisa esa columna en el libro antes de seguir.',
    estado: 'El árbol solo guarda borradores.',
    red: 'No pude hablar con el servidor. Lo que ves usa la definición de esta página, que puede estar desactualizada.',
    definicion: 'La definición del libro no cargó bien. Uso la de esta página, que puede estar desactualizada; no se guarda en el libro.',
    reglas: 'Tienes cambios a las reglas sin publicar. El libro guarda planes calculados con las reglas publicadas: vuelve a la definición original para guardar.'
  };
  function texto(codigo) { return TEXTOS[codigo] || 'El servidor respondió «' + String(codigo || 'sin respuesta').slice(0, 40) + '». No se guardó nada.'; }

  /* ───────── núcleo sin pantalla (se prueba en Node) ───────── */
  function nucleo(op) {
    op = op || {};
    var endpoint = op.endpoint || ENDPOINT, traer = op.fetch || (root.fetch && root.fetch.bind(root)), almacen = op.almacen || null, motor = op.motor, conexion = op.conexion;
    function lee(k) { try { return almacen ? almacen.getItem(k) : null; } catch (e) { return null; } }
    function pon(k, v) { try { if (almacen) almacen.setItem(k, v); return true; } catch (e) { return false; } }
    function quita(k) { try { if (almacen) almacen.removeItem(k); } catch (e) { } }
    function token() { return String(lee(LLAVE) || '').trim(); }
    function rid() { try { return root.crypto.randomUUID(); } catch (e) { return 'a' + Date.now() + '-' + Math.random().toString(36).slice(2); } }
    function conTiempo(url, opciones, ms) {
      var C = typeof AbortController === 'function' ? new AbortController() : null, reloj;
      var corte = new Promise(function (_, mal) { reloj = setTimeout(function () { try { if (C) C.abort(); } catch (e) { } mal(new Error('tiempo')); }, ms); });
      return Promise.race([traer(url, C ? Object.assign({}, opciones, { signal: C.signal }) : opciones).then(function (r) { return r.json(); }), corte])
        .then(function (j) { clearTimeout(reloj); return j && typeof j === 'object' ? j : { ok: false, error: 'red' }; }, function () { clearTimeout(reloj); return { ok: false, error: 'red' }; });
    }
    function leer(recurso, extra) {
      var q = '?recurso=' + encodeURIComponent(recurso) + '&k=' + encodeURIComponent(token());
      Object.keys(extra || {}).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(extra[k]); });
      return conTiempo(endpoint + q, { credentials: 'omit', redirect: 'follow' }, 45000);
    }
    function escribir(cuerpo) {
      cuerpo.k = token(); cuerpo.request_id = cuerpo.request_id || rid();
      return conTiempo(endpoint, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) }, 60000);
    }
    /* La definición con la que se trabaja: la del libro si hay sesión y carga sin errores; si no, la de la página, diciendo por qué. */
    function definicion() {
      if (!token() || !traer) return Promise.resolve({ modo: 'local', codigo: 'sin_sesion', aviso: texto('sin_sesion') });
      return leer('arbol-definicion').then(function (r) {
        if (!r.ok) return { modo: 'local', codigo: r.error || 'red', aviso: texto(r.error || 'red') };
        var c = null; try { c = motor.carga(r.tablas); } catch (e) { c = null; }
        if (!c || !c.definicion || (c.errores || []).length) return { modo: 'local', codigo: 'definicion', aviso: texto('definicion') };
        return { modo: 'libro', tablas: r.tablas, definicion: c.definicion, huella: c.huella || r.huella_hoja, puede: { guardar: !!(r.puede && r.puede.guardar) } };
      });
    }
    /* La columna de un plan, como la pide el servidor: [{ id, valor }]. Se calcula con la definición publicada. */
    function columnaDe(def, plan) {
      var res = motor.evalua(def, plan, null, { sugerencias: 'no', rutas: 'no' }), inf = motor.paqueteVisor(def, plan, { informe: true });
      return conexion.planAColumna(def, plan, res, { valores: inf.valores, motor: motor }).map(function (c) { return { id: c.id, valor: c.valor === undefined ? null : c.valor }; });
    }
    function origen() { try { var o = JSON.parse(lee(CLAVE_ORIGEN) || 'null'); return o && /^[A-Z]{1,3}$/.test(String(o.columna)) ? o : null; } catch (e) { return null; } }
    function fijaOrigen(o) { if (o) pon(CLAVE_ORIGEN, JSON.stringify(o)); else quita(CLAVE_ORIGEN); }
    /* sobre: true = actualizar la columna de origen (con su revisión); false = columna nueva. */
    function guarda(def, plan, datos) {
      datos = datos || {};
      var cuerpo = { tipo: 'arbol-guarda', nombre: String(datos.nombre || '').trim().slice(0, 120) || 'Plan del árbol', version: String(datos.version || '').trim().slice(0, 40) || 'V1', escenario: 'ARBOL', columna: columnaDe(def, plan) };
      var o = origen();
      if (datos.sobre) { if (!o) return Promise.resolve({ ok: false, error: 'columna_invalida' }); cuerpo.columna_existente = o.columna; cuerpo.rev = o.rev; }
      return escribir(cuerpo).then(function (r) {
        if (r.ok) fijaOrigen({ columna: r.columna, rev: r.rev, nombre: cuerpo.nombre, version: cuerpo.version });
        return r;
      });
    }
    function lista() { return leer('arbol-columnas'); }
    /* Abre una columna del árbol: la vuelve plan, comprueba que el motor la evalúa y la deja como el plan de la pantalla. */
    function abre(def, letra) {
      return leer('arbol-columna', { columna: letra }).then(function (r) {
        if (!r.ok) return r;
        var mapa = {}, nombre = '', version = '';
        (r.valores || []).forEach(function (x) { if (x && typeof x.id === 'string') { mapa[x.id] = x.valor; if (x.id === 'I-01') nombre = String(x.valor); if (x.id === 'I-02') version = String(x.valor); } });
        var v; try { v = conexion.columnaAPlan(def, mapa, { motor: motor }); } catch (e) { return { ok: false, error: 'definicion' }; }
        var ev = motor.evalua(def, v.plan, null, { sugerencias: 'no', rutas: 'no' });
        if (!v.plan || !v.plan.valores || !v.plan.valores['T-01'] || (ev.errores || []).length) return { ok: false, error: 'definicion' };
        if (!pon(CLAVE_PLAN, JSON.stringify({ plan: ev.plan || v.plan }))) return { ok: false, error: 'definicion' };
        quita(CLAVE_CMP);
        fijaOrigen({ columna: r.columna, rev: r.rev, nombre: nombre, version: version });
        return { ok: true, columna: r.columna, nombre: nombre, avisos: (v.avisos || []).length };
      });
    }
    return { token: token, definicion: definicion, columnaDe: columnaDe, guarda: guarda, lista: lista, abre: abre, origen: origen, fijaOrigen: fijaOrigen, texto: texto };
  }

  /* ───────── la barra (pantalla) ───────── */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function arranca(host, barra, op) {
    op = op || {};
    var doc = root.document, motor = op.motor || root.ArbolMotor, N = nucleo({ endpoint: op.endpoint || root.PPP2_ENDPOINT, fetch: op.fetch, almacen: op.almacen || root.localStorage, motor: motor, conexion: op.conexion || root.ArbolConexion });
    var est = { modo: 'local', aviso: '', puede: false, def: null, tablas: null, panel: '', lista: null, msg: '', ocupado: false, confirma: '' }, api = null;
    function monta() { api = root.ArbolPantalla.montar(host, est.tablas ? { motor: motor, tablas: est.tablas } : { motor: motor }); mide(); }
    function mide() { try { doc.documentElement.style.setProperty('--as-alto', barra.offsetHeight + 'px'); } catch (e) { } }
    function pinta() {
      var o = N.origen(), h = '<div class="as-fila"><span class="as-estado ' + (est.modo === 'libro' ? 'libro' : 'local') + '">' + (est.modo === 'libro' ? 'Conectado al libro' : 'Sin conexión al libro') + '</span>';
      if (est.modo === 'libro') {
        h += '<span class="as-origen">' + (o ? 'Plan abierto: «' + esc(o.nombre || 'sin nombre') + '» · columna ' + esc(o.columna) : 'Plan sin guardar') + '</span><span class="as-botones">' +
          (est.puede ? '<button type="button" class="as-btn" data-as="guardar"' + (est.ocupado ? ' disabled' : '') + '>Guardar en el libro</button>' : '') +
          '<button type="button" class="as-btn" data-as="abrir"' + (est.ocupado ? ' disabled' : '') + '>Abrir un plan</button></span>';
      }
      h += '</div>';
      if (est.modo !== 'libro' && est.aviso) h += '<p class="as-nota">' + esc(est.aviso) + '</p>';
      if (est.modo === 'libro' && !est.puede) h += '<p class="as-nota">' + esc(texto('permiso')) + '</p>';
      if (est.msg) h += '<p class="as-msg" role="status">' + esc(est.msg) + '</p>';
      if (est.panel === 'guardar') {
        h += '<form class="as-panel" data-as-form="guardar"><label>Nombre del plan <input name="nombre" maxlength="120" autocomplete="off" value="' + esc(o ? o.nombre : '') + '" placeholder="Por ejemplo: Predio de la esquina"></label>' +
          '<label>Versión <input name="version" maxlength="40" autocomplete="off" value="' + esc(o && o.version ? o.version : 'V1') + '"></label>' +
          '<p class="as-nota">Se guarda como Borrador, en una columna del libro. Lo que marcaste como confirmado vuelve como decidido al abrirlo: el libro guarda el valor, no su estado.</p><div class="as-botones">' +
          (o ? '<button type="submit" class="as-btn fuerte" name="modo" value="sobre">Guardar cambios en la columna ' + esc(o.columna) + '</button>' : '') +
          '<button type="submit" class="as-btn' + (o ? '' : ' fuerte') + '" name="modo" value="nueva">Guardar como plan nuevo</button><button type="button" class="as-btn" data-as="cerrar">Cancelar</button></div></form>';
      }
      if (est.panel === 'abrir') {
        h += '<div class="as-panel"><p class="as-nota">Abrir un plan reemplaza lo que tienes en pantalla.</p>';
        if (!est.lista) h += '<p class="as-nota" role="status">Buscando planes en el libro…</p>';
        else if (!est.lista.length) h += '<p class="as-nota">El árbol todavía no ha guardado planes en el libro.</p>';
        else h += '<ul class="as-lista">' + est.lista.map(function (c) {
          var conf = est.confirma === c.columna;
          return '<li><button type="button" class="as-btn' + (conf ? ' alerta' : '') + '" data-as="abre" data-col="' + esc(c.columna) + '">' + (conf ? 'Toca otra vez para abrir «' + esc(c.nombre || 'sin nombre') + '»' : esc(c.nombre || 'sin nombre') + ' · ' + esc(c.version || '') + ' · ' + esc(c.estado || '') + ' · columna ' + esc(c.columna)) + '</button></li>';
        }).join('') + '</ul>';
        h += '<div class="as-botones"><button type="button" class="as-btn" data-as="cerrar">Cerrar</button></div></div>';
      }
      barra.innerHTML = h; mide();
    }
    function fin(msg) { est.ocupado = false; est.msg = msg; pinta(); }
    barra.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-as]') : null; if (!b || est.ocupado) return;
      var a = b.getAttribute('data-as');
      if (a === 'cerrar') { est.panel = ''; est.confirma = ''; pinta(); }
      else if (a === 'guardar') {
        est.msg = ''; est.confirma = '';
        if (api && api.reglas && api.reglas().cambios.length) { est.panel = ''; est.msg = texto('reglas'); } else est.panel = est.panel === 'guardar' ? '' : 'guardar';
        pinta();
      } else if (a === 'abrir') {
        est.msg = ''; est.confirma = ''; est.panel = est.panel === 'abrir' ? '' : 'abrir'; est.lista = null; pinta();
        if (est.panel === 'abrir') N.lista().then(function (r) { if (est.panel !== 'abrir') return; if (!r.ok) { est.panel = ''; fin(texto(r.error)); return; } est.lista = Array.isArray(r.columnas) ? r.columnas : []; pinta(); });
      } else if (a === 'abre') {
        var col = b.getAttribute('data-col');
        if (est.confirma !== col) { est.confirma = col; pinta(); return; }
        est.ocupado = true; est.msg = 'Abriendo el plan…'; pinta();
        N.abre(est.def, col).then(function (r) {
          if (!r.ok) { fin(texto(r.error)); return; }
          est.panel = ''; est.confirma = ''; monta();
          fin('Abrí «' + (r.nombre || 'sin nombre') + '» de la columna ' + r.columna + '.' + (r.avisos ? ' ' + r.avisos + (r.avisos === 1 ? ' dato no se pudo leer y quedó' : ' datos no se pudieron leer y quedaron') + ' en referencia.' : ''));
        });
      }
    });
    barra.addEventListener('submit', function (e) {
      e.preventDefault(); if (est.ocupado || !api) return;
      var f = e.target, modo = (e.submitter && e.submitter.value) || 'nueva';
      if (api.reglas && api.reglas().cambios.length) { est.panel = ''; fin(texto('reglas')); return; }
      var datos = { nombre: f.nombre.value, version: f.version.value, sobre: modo === 'sobre' };
      est.ocupado = true; est.msg = 'Guardando en el libro…'; pinta();
      N.guarda(est.def, api.estado().plan, datos).then(function (r) {
        if (!r.ok) { fin(texto(r.error) + (r.columna ? ' Columna ' + r.columna + '.' : '')); return; }
        est.panel = ''; fin('Guardado como Borrador en la columna ' + r.columna + ' del libro (' + r.escritos + ' valores).');
      });
    });
    root.addEventListener('resize', mide);
    monta(); pinta();                                   // primero lo de la página; si el libro contesta, se cambia a su definición
    return N.definicion().then(function (d) {
      est.modo = d.modo; est.aviso = d.aviso || '';
      if (d.modo === 'libro') { est.tablas = d.tablas; est.def = d.definicion; est.puede = d.puede.guardar; monta(); }
      pinta();
      return { modo: est.modo, codigo: d.codigo || '', pantalla: function () { return api; } };
    });
  }
  return { nucleo: nucleo, arranca: arranca, texto: texto, ENDPOINT: ENDPOINT, CLAVES: { plan: CLAVE_PLAN, comparacion: CLAVE_CMP, origen: CLAVE_ORIGEN } };
});
