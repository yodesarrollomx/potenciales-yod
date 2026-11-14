/* Planes con libro dentro del PPP · 14-nov-2026 (unificación: un solo PPP).
   Un plan puede tener su modelo completo en un libro de Sheets (plantilla ppp2-libro-v1): versiones con
   aprobación, banco y capital, reparto, revisión para fondos. Esos planes se abren desde aquí, desde el
   PPP de siempre, en su ficha (`ppp2.html#/plan/<id>`):
     · la portada los lista en «Planes con libro»; si un caso guardado ya tiene su plan (columna
       `caso_ppp` del registro de planes: el identificador del caso), ese renglón abre la ficha y lo dice;
     · un motor abierto en un caso que ya tiene su plan avisa y lleva a la ficha.
   Sólo lectura, con la sesión de siempre (una pregunta por página a `?recurso=ppp2-vivero`). Sin sesión,
   sin respuesta o sin planes no pinta nada y no estorba. No calcula, no guarda y no toca la sesión. */
(function () {
  'use strict';
  var ENDPOINT = window.PPP2_ENDPOINT || 'https://script.google.com/macros/s/AKfycbywqwBh7uiD6DLmpTD6OUhzBX-AhkNxePhYgjn5Up3vAYdBzbV-2JyE7a5kKF_2QnO4/exec';
  var MOTORES = { 'mixto.html': 'mixto', 'macrolotes.html': 'macrolotes', 'unifamiliar.html': 'unifamiliar', 'residencial.html': 'residencial', 'patrimonial.html': 'patrimonial' };
  var ESPERA_MS = 30000, PAUSA_TRAS_FALLO_MS = 60000;
  var memo = null, fallo = 0, planes = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function credencial() {
    try { return localStorage.getItem('pyod_clave_v1') || ''; } catch (_) { return ''; }
  }
  function ficha(id) { return 'ppp2.html#/plan/' + encodeURIComponent(id); }
  function mdp(x) { return typeof x === 'number' && isFinite(x) ? '$' + x.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''; }
  function vivero() {
    if (memo) return memo;
    var k = credencial();
    if (!k || typeof fetch !== 'function') return Promise.resolve(null);              // sin sesión: se vuelve a intentar en la siguiente llamada
    if (fallo && Date.now() - fallo < PAUSA_TRAS_FALLO_MS) return Promise.resolve(null);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var reloj = setTimeout(function () { if (ctrl) ctrl.abort(); }, ESPERA_MS);
    memo = fetch(ENDPOINT + '?recurso=ppp2-vivero&k=' + encodeURIComponent(k), { credentials: 'omit', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { return j && j.ok === true && Array.isArray(j.planes) ? j.planes.filter(function (p) { return p && /^p2[a-z0-9]{6,20}$/.test(String(p.plan_id || '')); }) : null; })
      .catch(function () { return null; })
      .then(function (lista) { clearTimeout(reloj); if (!lista) { memo = null; fallo = Date.now(); } else planes = lista; return lista; });   // un fallo no se queda pegado
    return memo;
  }
  /* El registro guarda el identificador del caso (único entre los motores); si trae el motor delante («mixto:<caso>») debe coincidir. */
  function delCaso(lista, motor, caso) {
    caso = String(caso || '');
    for (var i = 0; i < lista.length; i++) {
      var c = String(lista[i].caso || '').split(':');
      if (caso && c[c.length - 1] === caso && (c.length < 2 || c[0] === motor)) return lista[i];
    }
    return null;
  }
  function resumen(p) {
    var partes = [];
    if (p.version) partes.push('V' + p.version + (p.version_estado ? ' ' + p.version_estado : ''));
    if (mdp(p.dueno_recibe)) partes.push('el dueño recibe ' + mdp(p.dueno_recibe) + ' MDP');
    if (p.edad) partes.push(p.edad);
    return partes.join(' · ');
  }
  var estiloPuesto = false;
  function estilo() {
    if (estiloPuesto || !document.head) return;
    estiloPuesto = true;
    var s = document.createElement('style');
    s.textContent = '.yod-libro-chip{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;font:600 10.5px/1.6 Manrope,system-ui,sans-serif;' +
      'letter-spacing:.03em;vertical-align:middle;white-space:nowrap;background:rgba(57,116,75,.14);border:1px solid rgba(57,116,75,.45);color:inherit}' +
      '.yod-libro-aviso{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:12px;max-width:min(560px,calc(100vw - 24px));' +
      'padding:10px 14px;border-radius:12px;background:#231d14;color:#fffdf9;font:500 13.5px/1.35 Manrope,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.28)}' +
      '.yod-libro-aviso a{flex:none;padding:6px 12px;border-radius:8px;background:#fffdf9;color:#231d14;font-weight:700;text-decoration:none}' +
      '.yod-libro-aviso button{flex:none;border:0;background:none;color:#d9cfbb;font:inherit;cursor:pointer;padding:4px}';
    document.head.appendChild(s);
  }

  /* ── portada: «Planes con libro» y los casos que ya tienen su plan ── */
  function pintaPortada(lista) {
    var caja = document.getElementById('listaTodos');
    if (!caja || !lista) return;
    estilo();
    var ligados = {};
    Array.prototype.forEach.call(caja.querySelectorAll('a.lt-item[href*="open="]'), function (a) {
      var m = /^([a-z]+\.html)\?open=([^&#]+)/.exec(a.getAttribute('href') || ''), motor = m && MOTORES[m[1]];
      var p = motor ? delCaso(lista, motor, decodeURIComponent(m[2])) : null;
      if (!p) return;
      ligados[p.plan_id] = true;
      a.setAttribute('href', ficha(p.plan_id));
      a.setAttribute('data-libro', p.plan_id);
      var dt = a.querySelector('.dt');
      if (dt && !a.querySelector('.yod-libro-chip')) {
        if (resumen(p)) dt.textContent = resumen(p);
        dt.insertAdjacentHTML('afterend', '<span class="yod-libro-chip" title="Este proyecto tiene su plan completo en un libro de Sheets">plan con libro</span>');
      }
    });
    var sueltos = lista.filter(function (p) { return !ligados[p.plan_id]; });      // los que no tienen un caso a la vista en la lista
    var viejo = caja.querySelector('.lt-libros');
    var html = sueltos.length ? '<section class="lt-group lt-libros" data-type="libro"><h2 class="lt-tipo">Planes con libro <span>' + sueltos.length + '</span></h2>' + sueltos.map(function (p) {
      return '<a class="lt-item" data-libro="' + esc(p.plan_id) + '" href="' + ficha(p.plan_id) + '"><span class="lt-dot lt-vertical" aria-hidden="true"></span><span class="nm">' + esc(p.nombre || 'Plan') +
        '<span class="dt">' + esc(resumen(p) || p.ubicacion || '') + '</span></span><span class="ir" aria-hidden="true">→</span></a>';
    }).join('') + '</section>' : '';
    if (viejo) { if (viejo.outerHTML !== html) viejo.outerHTML = html; }
    else if (html && caja.children.length) caja.insertAdjacentHTML('beforeend', html);
  }
  function portada() {
    var caja = document.getElementById('listaTodos');
    if (!caja) return;
    var pinta = function () { if (planes) pintaPortada(planes); else vivero().then(function (l) { if (l) pintaPortada(l); }); };
    var pendiente = 0;
    new MutationObserver(function () {                      // la lista se vuelve a pintar entera: se repone lo del libro
      if (pendiente) return;
      pendiente = setTimeout(function () { pendiente = 0; pinta(); }, 60);
    }).observe(caja, { childList: true });
    pinta();
  }

  /* ── motor abierto en un caso que ya tiene su plan: avisa y lleva a la ficha ── */
  function aviso(p, llevar) {
    estilo();
    var v = document.getElementById('yodLibroAviso');
    if (v) v.remove();
    v = document.createElement('div');
    v.id = 'yodLibroAviso'; v.className = 'yod-libro-aviso'; v.setAttribute('role', 'status');
    v.innerHTML = '<span>' + (llevar ? 'Este proyecto ya tiene su plan completo: te llevo a su ficha…' : 'Este proyecto ya tiene su plan completo, con sus versiones y su reparto.') + '</span>' +
      '<a href="' + ficha(p.plan_id) + '">Abrir el plan</a><button type="button" aria-label="Cerrar aviso">✕</button>';
    v.querySelector('button').addEventListener('click', function () { v.remove(); });
    document.body.appendChild(v);
  }
  var visto = '';
  function caso(motor, id) {
    id = String(id || '').trim();
    if (!motor || !/^[A-Za-z0-9-]{6,48}$/.test(id) || visto === motor + ':' + id) return Promise.resolve(null);
    return vivero().then(function (lista) {
      var p = lista ? delCaso(lista, motor, id) : null;
      if (!p) return null;
      visto = motor + ':' + id;
      /* Abierto por su liga (?open=…) y sin pedir el motor (?clasico=1): la ficha es la que tiene las cifras. */
      var q = new URLSearchParams(location.search), directo = q.get('open') === id && q.get('clasico') !== '1';
      aviso(p, directo);
      if (directo) setTimeout(function () { if (document.getElementById('yodLibroAviso')) location.assign(ficha(p.plan_id)); }, 1400);
      return p;
    });
  }
  function arranca() {
    var pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (document.getElementById('listaTodos') && document.querySelector('.projects-panel')) portada();
    var motor = MOTORES[pagina], abierto = new URLSearchParams(location.search).get('open');
    if (motor && abierto) caso(motor, abierto);
  }
  window.YodPPPLibro = { caso: caso, ficha: ficha, ENDPOINT: ENDPOINT };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})();
