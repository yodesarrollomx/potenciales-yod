/* Árbol PPP · página de prueba de los datos de presentación y sus estrellas (24-nov-2026; pedido de Dirección por voz, ver docs/arbol-presentacion.md).
   Carga la definición base (definicion-tablas.js), la extensión del reparto si está (definicion-reparto.js y reparto.js) y la extensión «presentación»
   (definicion-presentacion.js): los datos que la presentación pide y el árbol no traía, cada uno con su supuesto estándar editable, y el mapa
   ARBOL_PRESENTACION que dice qué nodos alimentan cada lámina. Monta la pantalla del Árbol; las estrellas y la vista «Presentación» las pinta pantalla.js.
   Copia de prueba: sólo vertical en venta, no guarda en el libro ni toca el PPP Maestro, no pide nada a internet y guarda sus planes aparte.
   Como la página del reparto, sólo arranca en una copia local (file:// o localhost): en un sitio publicado no monta nada, porque no pasa por el Portero.
   No calcula nada: «Llenar con el supuesto estándar» sólo contesta «No sé todavía» en cada decisión abierta, que es dejarla en su referencia. */
(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const PREFIJO_ALMACEN = 'ppp-presentacion-prueba:';   // claves de localStorage propias de esta página (el Árbol habitual usa las mismas sin prefijo)
  const esLocal = (loc) => !loc || loc.protocol === 'file:' || ['localhost', '127.0.0.1', '::1', '[::1]', ''].indexOf(String(loc.hostname || '')) >= 0;
  const SIN = { sugerencias: 'no', rutas: 'no' };

  /* la definición base, más el reparto si está cargado, más la presentación; todo en pestañas (lo mismo que hace la suite con extiende) */
  function definicion(motor) {
    motor = motor || root.ArbolMotor;
    const base = root.ARBOL_TABLAS, extP = root.ARBOL_PRESENTACION_EXT, extR = root.ARBOL_REPARTO_EXT;
    if (!motor || typeof motor.extiende !== 'function' || typeof motor.presentacion !== 'function') return { errores: [{ mensaje: 'Falta el motor del Árbol con las estrellas (motor.js de esta copia).' }] };
    if (!base || !extP) return { errores: [{ mensaje: 'Faltan las tablas del Árbol o la extensión de la presentación (definicion-tablas.js y definicion-presentacion.js).' }] };
    const conReparto = !!(extR && typeof motor.moduloReparto === 'function' && motor.moduloReparto());
    let d = base;
    if (conReparto) { const x = motor.extiende(d, extR); if (x.errores.length) return { errores: x.errores }; d = x.definicion; }
    const y = motor.extiende(d, extP);
    if (y.errores.length) return { errores: y.errores };
    const c = motor.carga(y.definicion);
    return { fuente: y.definicion, definicion: c.definicion, errores: c.errores, reparto: conReparto };
  }

  /* las decisiones que siguen sin contestar en un resultado del motor */
  const abiertasDe = (res) => (res.abiertas || []).filter((id) => { const n = (res.nodos || []).find((x) => x.id === id); return n && n.tipo === 'se_decide' && n.estado == null; });

  /* el plan «prehecho según el estándar»: «No sé todavía» (su referencia) en cada decisión abierta, hasta que no quede ninguna. Sin pantalla, para probarlo. */
  function planConEstandar(motor, def, plan) {
    let p = JSON.parse(JSON.stringify(plan)); const contestadas = [];
    for (let vuelta = 0; vuelta < 80; vuelta++) {
      const ab = abiertasDe(motor.evalua(def, p, null, SIN)); if (!ab.length) break;
      const cambio = {}; ab.forEach((id) => { cambio[id] = { estado: 'no_se' }; });
      const q = motor.planConCambio(def, p, cambio); if (!q.plan || (q.errores || []).length) break;
      p = q.plan; ab.forEach((id) => contestadas.push(id));
    }
    return { plan: p, contestadas };
  }

  /* una línea con el estado de la presentación, en palabras */
  function textoResumen(P) {
    if (!P) return 'Esta definición no trae datos de presentación.';
    const E = P.estrellas, falta = P.faltan.length;
    return 'Presentación: ' + P.completos + ' de ' + P.total + ' datos completos · ' + E.llenas + (E.llenas === 1 ? ' firme' : ' firmes') + ', ' + E.supuestos + ' con supuesto y ' + E.vacias + ' sin dato' +
      (falta ? ' · ' + (falta === 1 ? 'falta 1 dato clave' : 'faltan ' + falta + ' datos clave') : '') + '.';
  }

  /* monta la pantalla con la definición extendida y mantiene al día la barra de arriba */
  function arranca(host, barra, opciones) {
    opciones = opciones || {};
    const dice = (titulo, texto) => { barra.innerHTML = '<p class="pp-aviso" role="note"><strong>' + esc(titulo) + '</strong> ' + esc(texto) + '</p>'; };
    if (!opciones.permiteRemoto && !esLocal(root.location)) { dice('Página de prueba local.', 'Esta copia de prueba no usa la puerta de acceso del portal y no pide nada a internet: ábrela desde una copia local del repositorio (archivo o localhost). En un sitio publicado no se monta.'); return null; }
    const motor = opciones.motor || root.ArbolMotor, d = definicion(motor);
    if (d.errores && d.errores.length) { dice('No se pudo cargar la presentación.', d.errores.map((e) => e.mensaje).join(' ')); return null; }
    const api = root.ArbolPantalla.montar(host, { motor, tablas: d.fuente, proyecto: opciones.proyecto || 'Copia de prueba · presentación', prefijoAlmacen: PREFIJO_ALMACEN });
    if (!api) { dice('No se pudo montar la pantalla.', ''); return null; }
    let mensaje = '';
    barra.innerHTML = '<div class="pp-fila"><button type="button" class="pp-btn" data-pp="estandar">Llenar con el supuesto estándar</button>' +
      '<details class="pp-nota"><summary>Copia de prueba · estimado</summary><p class="pp-aviso" role="note">' + esc(opciones.aviso || 'Copia de prueba de los datos de presentación: sólo vertical en venta. No guarda en el libro ni toca el PPP Maestro, no pide nada a internet y guarda sus planes aparte de los del Árbol habitual. Todo es estimado, sin autorización de pago.') + '</p></details></div>' +
      '<p class="pp-res" data-pp-res role="status" aria-live="polite"></p>';
    const resEl = barra.querySelector('[data-pp-res]');
    const mide = () => { try { root.document.documentElement.style.setProperty('--pp-alto', barra.offsetHeight + 'px'); } catch (e) { /* sin estilos: la pantalla usa su alto de siempre */ } };
    let ultimo = null;
    const pinta = () => {
      const t = (mensaje ? mensaje + ' ' : '') + textoResumen(api.presentacion());
      if (t !== ultimo) { ultimo = t; resEl.textContent = t; mide(); }
    };
    barra.addEventListener('toggle', mide, true);   // al abrir o cerrar la nota cambia el alto de la barra
    barra.addEventListener('click', (e) => {
      const b = e.target.closest ? e.target.closest('[data-pp]') : null; if (!b) return;
      if (b.getAttribute('data-pp') === 'estandar') {
        let n = 0;
        for (let vuelta = 0; vuelta < 80; vuelta++) {
          const ab = abiertasDe(api.estado().res); if (!ab.length) break;
          const cambio = {}; ab.forEach((id) => { cambio[id] = { estado: 'no_se' }; });
          const r = api.decide(ab[0], cambio, { titulo: 'Supuesto estándar en ' + (ab.length === 1 ? '1 decisión' : ab.length + ' decisiones') });
          if (!r || (r.errores || []).length) break;
          n += ab.length;
        }
        mensaje = n ? 'Puse el supuesto estándar en ' + (n === 1 ? '1 decisión' : n + ' decisiones') + '; cada una se cambia en el árbol.' : 'No hay decisiones abiertas: el plan ya está lleno.';
        pinta();
      }
    });
    pinta();
    let t = null;
    if (root.MutationObserver) new root.MutationObserver(() => { clearTimeout(t); t = setTimeout(pinta, 120); }).observe(host, { childList: true, subtree: true });
    if (root.addEventListener) root.addEventListener('resize', mide);
    return api;
  }

  const api = { definicion, planConEstandar, abiertasDe, textoResumen, arranca, PREFIJO_ALMACEN, esLocal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ArbolPresentacionPrueba = api;
  if (typeof document !== 'undefined' && document.getElementById) {
    const go = () => { const host = document.getElementById('arbol-ppp'), barra = document.getElementById('presentacion-barra'); if (host && barra) arranca(host, barra, root.ARBOL_PRESENTACION_OPCIONES || {}); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
