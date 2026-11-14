/* Folio del plan · 13-nov-2026 (análisis «YOD OS tablero por tablero», etapa 2).
   Cada plan muestra a qué terreno de la cartera pertenece y en qué etapa va. La etapa NO se copia
   al plan: se lee del folio. Pregunta UNA vez por página al Portero (?recurso=cartera, sólo lectura,
   con la sesión de siempre) y busca el terreno cuya columna «plan» del Control Maestro apunta a este
   plan («mixto:<caso>», «ppp2:<plan>», …). Sin sesión, sin respuesta o sin terreno ligado no pinta
   nada y no estorba: el plan sigue igual.
   Uso: YodPPPFolio.caso('mixto', caso.caso_id, elementoDondePintar) */
(function () {
  'use strict';
  var MOTORES = ['ppp2', 'mixto', 'macrolotes', 'unifamiliar', 'residencial', 'patrimonial'];
  var ESPERA_MS = 20000, PAUSA_TRAS_FALLO_MS = 60000;
  var memo = null, fallo = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function credencial() {
    try { return localStorage.getItem('pyod_clave_v1') || ''; } catch (_) { return ''; }
  }
  function cartera() {
    if (memo) return memo;
    var base = (window.YOD_PORTERO || {}).original, k = credencial();
    if (!base || !k || typeof fetch !== 'function') return Promise.resolve(null);   // sin sesión: se vuelve a intentar en la siguiente llamada
    if (fallo && Date.now() - fallo < PAUSA_TRAS_FALLO_MS) return Promise.resolve(null);   // tras un fallo, un minuto sin insistir
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var reloj = setTimeout(function () { if (ctrl) ctrl.abort(); }, ESPERA_MS);
    memo = fetch(base + '?recurso=cartera&k=' + encodeURIComponent(k), { credentials: 'omit', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { return j && j.ok === true && Array.isArray(j.proyectos) ? j.proyectos : null; })
      .catch(function () { return null; })
      .then(function (lista) { clearTimeout(reloj); if (!lista) { memo = null; fallo = Date.now(); } return lista; });  // un fallo no se queda pegado
    return memo;
  }
  function clave(motor, id) {
    motor = String(motor || '').toLowerCase(); id = String(id || '').trim();
    return MOTORES.indexOf(motor) > -1 && /^[A-Za-z0-9-]{6,48}$/.test(id) ? motor + ':' + id : '';
  }
  function buscar(motor, id) {
    var c = clave(motor, id);
    if (!c) return Promise.resolve(null);
    return cartera().then(function (lista) {
      if (!lista) return null;
      for (var i = 0; i < lista.length; i++) if (lista[i] && lista[i].plan === c) return lista[i];
      return null;
    });
  }
  function sello(p) {
    var etapa = p.etapa_n ? p.etapa_n + ' · ' + p.etapa : 'sin etapa';
    var pausa = String(p.admision || '').toLowerCase() === 'standby';
    return '<span class="yod-folio" title="Terreno de la cartera y su etapa del folio (Control Maestro). La etapa se lee de ahí, no se copia al plan.">' +
      esc(p.folio) + ' · ' + esc(etapa) + (pausa ? ' · en pausa' : '') + '</span>';
  }
  var estiloPuesto = false;
  function estilo() {
    if (estiloPuesto || !document.head) return;
    estiloPuesto = true;
    var s = document.createElement('style');
    s.textContent = '.yod-folio{display:inline-block;margin-left:10px;padding:2px 10px;border-radius:999px;' +
      'font:600 11px/1.6 Manrope,system-ui,sans-serif;letter-spacing:.03em;vertical-align:middle;white-space:nowrap;' +
      'background:rgba(185,139,60,.16);border:1px solid rgba(185,139,60,.5);color:inherit}';
    document.head.appendChild(s);
  }
  /* Pinta el sello dentro de «donde». Si mientras llega la respuesta la página ya pinta otro plan,
     no toca nada (cada llamada deja su marca y sólo la más reciente escribe). */
  function caso(motor, id, donde) {
    if (!donde) return Promise.resolve(null);
    var marca = String(Date.now()) + Math.random();
    donde.setAttribute('data-yod-folio', marca);
    var viejo = donde.querySelector && donde.querySelector('.yod-folio');
    if (viejo && viejo.parentNode) viejo.parentNode.removeChild(viejo);
    return buscar(motor, id).then(function (p) {
      if (!p || donde.getAttribute('data-yod-folio') !== marca) return null;
      estilo();
      donde.insertAdjacentHTML('beforeend', sello(p));
      return p;
    });
  }
  window.YodPPPFolio = { caso: caso, buscar: buscar, sello: sello, clave: clave, _reiniciar: function () { memo = null; fallo = 0; } };
})();
