/* Árbol PPP · puente con el libro. Con la sesión del Portero que ya está en el navegador, pide al servidor del PPP 2 la definición
   publicada del árbol, guarda el plan como una columna en Borrador y abre los planes que el árbol guardó.
   - Sin sesión, con el árbol apagado en el servidor o sin red, la pantalla trabaja con la definición de la página y NO guarda en el libro: lo dice.
   - No calcula nada: la columna la arma conexion.js y las cifras el motor. Nunca borra la credencial del Portero.
   - La dirección del servidor es la misma de ppp2.js (una prueba las compara) y no se puede cambiar desde la página. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root); else root.ArbolServidor = factory(root);
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbywqwBh7uiD6DLmpTD6OUhzBX-AhkNxePhYgjn5Up3vAYdBzbV-2JyE7a5kKF_2QnO4/exec';
  var LLAVE = 'pyod_clave_v1', CLAVE_PLAN = 'ppp-arbol-pantalla-2', CLAVE_CMP = 'ppp-arbol-comparacion-1', CLAVE_ORIGEN = 'ppp-arbol-libro-1';
  var TEXTOS = {
    apagado: 'El árbol todavía no está conectado al libro. Puedes armar el plan aquí; no se guarda en el libro.',
    recurso: 'El árbol todavía no está conectado al libro. Puedes armar el plan aquí; no se guarda en el libro.',   // un servidor que aún no trae las rutas del árbol
    interno: 'El servidor tuvo un problema. Puedes armar el plan aquí; por ahora no se guarda en el libro.',
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
    revision_base: 'La versión de origen cambió en el libro. Ábrela de nuevo antes de agregar otra versión.',
    base_version: 'Abre la versión que quieres usar como origen.',
    version_vacia: 'Escribe un nombre para la nueva versión.',
    version_repetida: 'Ya existe una versión con ese nombre en este proyecto. Elige otro nombre.',
    sin_cambios: 'Esta versión ya contiene los valores que tienes en pantalla.',
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
    cambio_local: 'Cambiaste el plan en pantalla mientras abría el del libro: no lo pisé. Ábrelo desde «Abrir un plan» si lo quieres.',
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
        return { modo: 'libro', tablas: r.tablas, definicion: c.definicion, huella: c.huella || r.huella_hoja, puede: { guardar: !!(r.puede && r.puede.guardar), versiones: !!(r.puede && r.puede.versiones) } };
      });
    }
    /* La columna de un plan, como la pide el servidor: [{ id, valor }]. Se calcula con la definición publicada. */
    function columnaDe(def, plan) {
      var res = motor.evalua(def, plan, null, { sugerencias: 'no', rutas: 'no' }), inf = motor.paqueteVisor(def, plan, { informe: true });
      return conexion.planAColumna(def, plan, res, { valores: inf.valores, motor: motor }).map(function (c) { return { id: c.id, valor: c.valor === undefined ? null : c.valor }; });
    }
    /* Cada pestaña conserva el origen de su propio árbol, aunque otra pestaña abra otra columna. */
    var origenActivo = null;
    try {
      var persistido = JSON.parse(lee(CLAVE_ORIGEN) || 'null');
      if (persistido && /^[A-Z]{1,3}$/.test(String(persistido.columna))) origenActivo = persistido;
    } catch (e) { }
    function origen() { return origenActivo; }
    function fijaOrigen(o) { origenActivo = o; if (o) pon(CLAVE_ORIGEN, JSON.stringify(o)); else quita(CLAVE_ORIGEN); }
    /* sobre: true = actualizar la columna de origen (con su revisión); false = columna nueva. */
    function guarda(def, plan, datos) {
      datos = datos || {};
      var cuerpo = { tipo: 'arbol-guarda', nombre: String(datos.nombre || '').trim().slice(0, 120) || 'Plan del árbol', version: String(datos.version || '').trim().slice(0, 40) || 'V1', escenario: 'ARBOL' };
      var o = origen();
      if (datos.derivada) {
        if (!o || !o.rev || datos.sobre) return Promise.resolve({ ok: false, error: 'base_version' });
        cuerpo.base_columna = o.columna; cuerpo.base_rev = o.rev;
        cuerpo.version = String(datos.version || '').trim().slice(0, 40);
        if (!cuerpo.version) return Promise.resolve({ ok: false, error: 'version_vacia' });
        return escribir(cuerpo);
      }
      try { cuerpo.columna = columnaDe(def, plan); } catch (e) { return Promise.resolve({ ok: false, error: 'definicion' }); }
      /* El paquete del visor de esta versión (el mismo de la vista previa): el servidor lo guarda junto a la columna para que la liga del
         visor enseñe esta versión y cambie cuando se vuelve a guardar. Si no cabe o falla, el plan se guarda igual, sin visor. */
      try { var pv = JSON.stringify(motor.paqueteVisor(def, plan)); if (pv.length <= 50000) cuerpo.visor = pv; } catch (e3) { }
      if (datos.sobre) {
        if (!o) return Promise.resolve({ ok: false, error: 'columna_invalida' });
        cuerpo.columna_existente = o.columna; cuerpo.rev = o.rev; cuerpo.escenario = o.escenario || cuerpo.escenario;
      }
      function guardaCuerpo() {
        return escribir(cuerpo).then(function (r) {
          if (r.ok) fijaOrigen(Object.assign({}, datos.sobre ? o : {}, { columna: r.columna, rev: r.rev, nombre: cuerpo.nombre, version: cuerpo.version }));
          return r;
        });
      }
      if (!datos.sobre || !o.cambio || !/^Derivada de /.test(o.cambio)) return guardaCuerpo();
      return leer('arbol-columna', { columna: o.columna }).then(function (r) {
        if (!r.ok) return r;
        if (r.rev !== o.rev) return { ok: false, error: 'revision' };
        var antes = {}, visto;
        try {
          visto = planDeColumna(def, r);
          if (!visto) return { ok: false, error: 'definicion' };
          columnaDe(def, visto.plan).forEach(function (c) { antes[c.id] = c.valor; });
        } catch (e) { return { ok: false, error: 'definicion' }; }
        cuerpo.columna = cuerpo.columna.filter(function (c) { return c.valor !== antes[c.id]; });
        if (!cuerpo.columna.length && cuerpo.nombre === o.nombre && cuerpo.version === o.version) return { ok: false, error: 'sin_cambios' };
        return guardaCuerpo();
      });
    }
    function lista() { return leer('arbol-columnas'); }
    function versiones(o, columnas) {
      var nombre = String(o.nombre || '').trim().toLowerCase();
      return columnas.filter(function (c) { return nombre && String(c.nombre || '').trim().toLowerCase() === nombre; });
    }
    function planDeColumna(def, r) {
      var mapa = {};
      (Array.isArray(r.valores) ? r.valores : []).forEach(function (x) { if (x && typeof x.id === 'string') mapa[x.id] = x.valor; });
      var v = conexion.columnaAPlan(def, mapa, { motor: motor });
      var ev = motor.evalua(def, v.plan, null, { sugerencias: 'no', rutas: 'no' });
      if (!v.plan || !v.plan.valores || !v.plan.valores['T-01'] || (ev.errores || []).length) return null;
      return { plan: ev.plan || v.plan, mapa: mapa, avisos: (v.avisos || []).length };
    }
    /* Abre una columna del árbol: la vuelve plan, comprueba que el motor la evalúa y la deja como el plan de la pantalla. */
    function abre(def, letra, guardia) {
      return leer('arbol-columna', { columna: letra }).then(function (r) {
        if (!r.ok) return r;
        var v; try { v = planDeColumna(def, r); } catch (e) { return { ok: false, error: 'definicion' }; }
        if (!v) return { ok: false, error: 'definicion' };
        if (typeof guardia === 'function' && !guardia(v.plan)) return { ok: false, error: 'cambio_local' };
        if (!pon(CLAVE_PLAN, JSON.stringify({ plan: v.plan }))) return { ok: false, error: 'definicion' };
        quita(CLAVE_CMP);
        var nombre = String(v.mapa['I-01'] || ''), version = String(v.mapa['I-02'] || '');
        var o = { columna: r.columna, rev: r.rev, nombre: nombre, version: version };
        if (v.mapa['I-03'] && v.mapa['I-03'] !== 'ARBOL') o.escenario = String(v.mapa['I-03']);
        if (v.mapa['I-07']) o.cambio = String(v.mapa['I-07']);
        fijaOrigen(o);
        return { ok: true, columna: r.columna, nombre: nombre, avisos: v.avisos };
      });
    }
    return { token: token, definicion: definicion, columnaDe: columnaDe, guarda: guarda, lista: lista, versiones: versiones, abre: abre, origen: origen, fijaOrigen: fijaOrigen, texto: texto };
  }

  /* ───────── la barra (pantalla) ───────── */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function procedencia(nota) {
    return String(nota).split('\n').map(function (linea) {
      var partes = /^(.*?)\s*(\S+)$/.exec(linea);
      if (partes) {
        try {
          var url = new URL(partes[2]);
          if (url.protocol === 'https:') {
            var rango = new URLSearchParams(url.hash.slice(1)).get('range'), nombre = (partes[1] || 'Fuente').replace(/[\s·:]+$/, '');
            return '<a href="' + esc(url.href) + '" target="_blank" rel="noopener noreferrer">' + esc(nombre + (rango ? ' · ' + rango : '')) + '</a>';
          }
        } catch (e) { }
      }
      return esc(linea);
    }).join('<br>');
  }
  function arranca(host, barra, op) {
    op = op || {};
    var doc = root.document, motor = op.motor || root.ArbolMotor, N = nucleo({ endpoint: op.endpoint, fetch: op.fetch, almacen: op.almacen || root.localStorage, motor: motor, conexion: op.conexion || root.ArbolConexion });
    var est = { modo: 'local', aviso: '', puede: false, versiones: false, def: null, tablas: null, panel: '', lista: null, msg: '', ocupado: false, confirma: '', nombreVersion: '' }, api = null;
    function monta() {
      api = root.ArbolPantalla.montar(host, { motor: motor, tablas: est.tablas || undefined, alReiniciar: function () { N.fijaOrigen(null); est.panel = ''; est.confirma = ''; est.msg = ''; pinta(); } });
      mide();
    }
    function mide() { try { doc.documentElement.style.setProperty('--as-alto', barra.offsetHeight + 'px'); } catch (e) { } }
    function botonPanel(panel, nombre) {
      return '<button type="button" class="as-btn" data-as="' + panel + '" aria-expanded="' + (est.panel === panel) + '"' + (est.ocupado ? ' disabled' : '') + '>' + nombre + '</button>';
    }
    /* el caso del visor de este proyecto: la misma clave que arma el servidor (arbol_caso_) */
    function casoVisor(n) {
      var x = String(n == null ? '' : n).toLowerCase();
      try { x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { }
      x = x.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56).replace(/-+$/, '');
      return x ? 'arbol-' + x : '';
    }
    function pinta() {
      var o = N.origen(), h = '<div class="as-fila"><span class="as-estado ' + (est.modo === 'libro' ? 'libro' : 'local') + '">' + (est.modo === 'libro' ? 'Conectado al libro' : 'Sin conexión al libro') + '</span>';
      var titulo = host.querySelector('.ppp-proy');
      if (titulo && est.modo === 'libro') titulo.textContent = o && o.nombre ? o.nombre : 'Predio de muestra';
      if (est.modo === 'libro') {
        h += '<span class="as-origen">' + (o ? '«' + esc(o.nombre || 'sin nombre') + '» · ' + esc(o.version || 'versión sin etiqueta') + ' · columna ' + esc(o.columna) : 'Plan sin guardar') + '</span><span class="as-botones">' +
          (o && o.nombre ? botonPanel('versiones', 'Versiones del proyecto') : '') +
          (o && o.nombre && casoVisor(o.nombre) ? '<a class="as-btn" data-as-visor href="../visor.html#p=ppp:' + casoVisor(o.nombre) + '">Ver visor</a>' : '') +
          (est.puede && est.versiones && o && o.nombre ? botonPanel('agregar', 'Agregar versión') : '') +
          (est.puede ? botonPanel('guardar', 'Guardar en el libro') : '') +
          (o && o.nombre ? '' : botonPanel('abrir', 'Abrir un plan')) + '</span>';   // con un proyecto abierto sólo se escogen SUS versiones; otro proyecto se abre desde la portada
      }
      h += '</div>';
      if (est.modo !== 'libro' && est.aviso) h += '<p class="as-nota">' + esc(est.aviso) + '</p>';
      if (est.modo === 'libro' && !est.puede) h += '<p class="as-nota">' + esc(texto('permiso')) + '</p>';
      if (est.msg) h += '<p class="as-msg" role="status">' + esc(est.msg) + '</p>';
      if (est.panel === 'agregar' && o) {
        h += '<form class="as-panel" data-as-form="agregar"><p class="as-nota">Crea un borrador a partir de la versión guardada «' + esc(o.version || 'versión sin etiqueta') + '».</p>' +
          '<label>Nombre de la nueva versión <input name="version" maxlength="40" autocomplete="off" required value="' + esc(est.nombreVersion) + '"></label><div class="as-botones">' +
          '<button type="submit" class="as-btn fuerte"' + (est.ocupado ? ' disabled' : '') + '>Crear versión</button><button type="button" class="as-btn" data-as="cerrar">Cancelar</button></div></form>';
      }
      if (est.panel === 'guardar') {
        h += '<form class="as-panel" data-as-form="guardar"><label>Nombre del plan <input name="nombre" maxlength="120" autocomplete="off" value="' + esc(o ? o.nombre : '') + '" placeholder="Por ejemplo: Predio de la esquina"></label>' +
          '<label>Versión <input name="version" maxlength="40" autocomplete="off" value="' + esc(o && o.version ? o.version : 'V1') + '"></label>' +
          '<p class="as-nota">Se guarda como Borrador, en una columna del libro. Lo que marcaste como confirmado vuelve como decidido al abrirlo: el libro guarda el valor, no su estado.</p><div class="as-botones">' +
          '<button type="submit" class="as-btn fuerte"' + (est.ocupado ? ' disabled' : '') + '>Guardar como plan nuevo</button>' +
          (o ? '<button type="button" class="as-btn' + (est.confirma === 'sobre' ? ' alerta' : '') + '" data-as="sobre">' + (est.confirma === 'sobre' ? 'Toca otra vez para guardar cambios en «' : 'Guardar cambios en «') + esc(o.version || o.nombre || 'sin nombre') + '» · columna ' + esc(o.columna) + '</button>' : '') +
          '<button type="button" class="as-btn" data-as="cerrar">Cancelar</button></div></form>';
      }
      if (est.panel === 'abrir' || est.panel === 'versiones') {
        var delProyecto = est.panel === 'versiones', lista = est.lista && delProyecto ? N.versiones(o || {}, est.lista) : est.lista;
        if (lista && est.solo) lista = lista.filter(function (c) { return c.columna === est.solo; });
        h += '<div class="as-panel">' + (delProyecto || est.solo ? '' : '<p class="as-nota">Abrir un plan reemplaza lo que tienes en pantalla.</p>');
        if (!lista) h += '<p class="as-nota" role="status">Buscando en el libro…</p>';
        else if (!lista.length) h += '<p class="as-nota">' + (delProyecto ? 'No encontré versiones guardadas para este proyecto.' : 'El árbol todavía no ha guardado planes en el libro.') + '</p>';
        else h += '<ul class="as-lista">' + lista.map(function (c) {
          var conf = est.confirma === c.columna;
          var version = esc(c.version || 'versión sin etiqueta'), nombre = (delProyecto ? '' : esc(c.nombre || 'sin nombre') + ' · ') + version;
          if (c.escenario && c.escenario !== 'ARBOL') nombre += ' · ' + esc(c.escenario);
          var actual = o && o.columna === c.columna;
          return '<li><button type="button" class="as-btn' + (conf ? ' alerta' : '') + '" data-as="abre" data-col="' + esc(c.columna) + '"' + (actual ? ' aria-current="true"' : '') + '>' +
            (conf ? 'Toca otra vez para abrir ' + nombre : nombre + (delProyecto ? '' : ' · columna ' + esc(c.columna)) + (actual ? ' · en pantalla' : '')) + '</button>' +
            (delProyecto && c.cambio ? '<p class="as-nota as-procedencia">' + procedencia(c.cambio) + '</p>' : '') + '</li>';
        }).join('') + '</ul>';
        h += '<div class="as-botones"><button type="button" class="as-btn" data-as="cerrar">Cerrar</button></div></div>';
      }
      barra.innerHTML = h; mide();
    }
    function fin(msg) { est.ocupado = false; est.msg = msg; pinta(); }
    function falla() { fin(texto('red')); }
    var consulta = 0;
    function cargaLista() {
      var peticion = ++consulta, panel = est.panel;
      est.lista = null; pinta();
      N.lista().then(function (r) {
        if (consulta !== peticion || est.panel !== panel) return;
        if (!r.ok) { est.panel = ''; fin(texto(r.error)); return; }
        est.lista = Array.isArray(r.columnas) ? r.columnas : []; pinta();
      }).catch(function () { if (consulta === peticion && est.panel === panel) falla(); });
    }
    function guardaAhora(sobre) {
      var f = barra.querySelector('form[data-as-form="guardar"]'); if (!f || est.ocupado || !api) return;
      if (api.reglas && api.reglas().cambios.length) { est.panel = ''; fin(texto('reglas')); return; }
      var datos = { nombre: f.elements.nombre.value, version: f.elements.version.value, sobre: !!sobre };
      est.ocupado = true; est.confirma = ''; est.msg = 'Guardando en el libro…'; pinta();
      N.guarda(est.def, api.estado().plan, datos).then(function (r) {
        if (!r.ok) { fin(texto(r.error) + (r.columna ? ' Columna ' + r.columna + '.' : '')); return; }
        est.panel = ''; est.nombreVersion = ''; fin('Guardado como Borrador en la columna ' + r.columna + ' del libro (' + r.escritos + ' valores).');
      }).catch(falla);
    }
    function agregaAhora(f) {
      var o = N.origen(); if (!o || est.ocupado || !est.puede || !est.versiones || !api) return;
      if (api.reglas && api.reglas().cambios.length) { fin(texto('reglas')); return; }
      est.nombreVersion = f.elements.version.value;
      var foto = JSON.stringify(api.estado().plan || {});
      est.ocupado = true; est.msg = 'Creando versión…'; pinta();
      N.guarda(est.def, null, { nombre: o.nombre, version: est.nombreVersion, derivada: true }).then(function (r) {
        if (!r.ok) { fin(texto(r.error)); return; }
        est.panel = 'versiones'; est.confirma = ''; est.nombreVersion = '';
        var mensaje = 'Creé «' + r.version + '» como Borrador · columna ' + r.columna + '.';
        return N.abre(est.def, r.columna, function () { return JSON.stringify(api.estado().plan || {}) === foto; }).then(function (abierta) {
          if (abierta.ok) monta();
          fin(mensaje + (abierta.ok ? '' : ' ' + texto(abierta.error)));
          cargaLista();
        });
      }).catch(falla);
    }
    barra.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-as]') : null; if (!b || est.ocupado) return;
      var a = b.getAttribute('data-as');
      if (a === 'cerrar') { est.panel = ''; est.confirma = ''; est.solo = ''; pinta(); }
      else if (a === 'sobre') {
        if (!N.origen()) { est.confirma = ''; pinta(); return; }
        if (est.confirma !== 'sobre') { var fo = barra.querySelector('form[data-as-form="guardar"]'), nom = fo ? fo.nombre.value : '', ver = fo ? fo.version.value : ''; est.confirma = 'sobre'; pinta(); fo = barra.querySelector('form[data-as-form="guardar"]'); if (fo) { fo.nombre.value = nom; fo.version.value = ver; } return; }
        guardaAhora(true);
      }
      else if (a === 'agregar') {
        est.panel = est.panel === 'agregar' ? '' : 'agregar'; est.confirma = ''; est.msg = ''; est.nombreVersion = ''; pinta();
        var campoVersion = barra.querySelector('[data-as-form="agregar"] input'); if (campoVersion) campoVersion.focus();
      } else if (a === 'guardar') {
        est.msg = ''; est.confirma = '';
        if (api && api.reglas && api.reglas().cambios.length) { est.panel = ''; est.msg = texto('reglas'); } else est.panel = est.panel === 'guardar' ? '' : 'guardar';
        pinta();
      } else if (a === 'abrir' || a === 'versiones') {
        est.msg = ''; est.confirma = ''; est.solo = ''; est.panel = est.panel === a ? '' : a;
        if (est.panel) cargaLista(); else pinta();
      } else if (a === 'abre') {
        var col = b.getAttribute('data-col');
        if (est.confirma !== col) { est.confirma = col; pinta(); barra.querySelector('[data-col="' + col + '"]').focus(); return; }
        var foto = JSON.stringify(api.estado().plan || {});
        est.ocupado = true; est.msg = 'Abriendo el plan…'; pinta();
        N.abre(est.def, col, function () { return JSON.stringify(api.estado().plan || {}) === foto; }).then(function (r) {
          if (!r.ok) { fin(texto(r.error)); return; }
          est.panel = ''; est.confirma = ''; est.solo = ''; monta();
          fin('Abrí «' + (r.nombre || 'sin nombre') + '» de la columna ' + r.columna + '.' + (r.avisos ? ' ' + r.avisos + (r.avisos === 1 ? ' dato no se pudo leer y quedó' : ' datos no se pudieron leer y quedaron') + ' en referencia.' : ''));
        }).catch(falla);
      }
    });
    barra.addEventListener('submit', function (e) {
      e.preventDefault();
      if (e.target.getAttribute('data-as-form') === 'agregar') agregaAhora(e.target); else guardaAhora(false);
    });
    root.addEventListener('resize', mide);
    /* La columna de origen identifica la versión, pero el plan de esa sesión puede tener ediciones locales. */
    function abrirDeLiga() {
      var m = /^#abrir=([A-Z]{1,3})$/.exec(root.location ? root.location.hash || '' : ''); if (!m || !api) return;
      try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) { }
      var col = m[1], o = N.origen(), plan = api.estado().plan || {};
      var tieneDatos = Object.keys(plan.valores || {}).length > 0;
      function pideConfirmacion() {
        est.ocupado = false; est.panel = 'abrir'; est.confirma = col; est.solo = col;
        est.msg = 'Hay datos en pantalla: toca el plan para reemplazarlos por los del libro.'; cargaLista();
      }
      if (tieneDatos && (!o || o.columna !== col)) { pideConfirmacion(); return; }
      var foto = JSON.stringify(plan);
      est.ocupado = true; est.msg = 'Abriendo el plan…'; pinta();
      N.abre(est.def, col, function (planDelLibro) {
        return JSON.stringify(api.estado().plan || {}) === foto && (!tieneDatos || JSON.stringify(planDelLibro) === foto);
      }).then(function (r) {
        if (r.error === 'cambio_local') { pideConfirmacion(); return; }
        if (!r.ok) { fin(texto(r.error)); return; }
        monta(); fin('Abrí «' + (r.nombre || 'sin nombre') + '» de la columna ' + r.columna + '.');
      }).catch(falla);
    }
    monta(); pinta();                                   // primero lo de la página; si el libro contesta, se cambia a su definición
    return N.definicion().catch(function () { return { modo: 'local', codigo: 'red', aviso: texto('red') }; }).then(function (d) {
      est.modo = d.modo; est.aviso = d.aviso || '';
      if (d.modo === 'libro') { est.tablas = d.tablas; est.def = d.definicion; est.puede = d.puede.guardar; est.versiones = d.puede.versiones; monta(); }
      pinta();
      if (d.modo === 'libro') abrirDeLiga();
      return { modo: est.modo, codigo: d.codigo || '', pantalla: function () { return api; } };
    });
  }
  return { nucleo: nucleo, arranca: arranca, texto: texto, ENDPOINT: ENDPOINT, CLAVES: { plan: CLAVE_PLAN, comparacion: CLAVE_CMP, origen: CLAVE_ORIGEN } };
});
