/* Árbol PPP · página de prueba del módulo de repartos (SPPP · T-10, corrección 1 por el dictamen T-11, hallazgo B07).
   Carga la definición base (definicion-tablas.js) con la extensión del reparto (definicion-reparto.js), monta la pantalla del Árbol y muestra
   junto a ella el estado del reparto del plan en pantalla: estado, motivos, corte y fechas (N-02), totales simulado, autorizado y pagado, y el
   estado de los datos de las fichas (C2). Copia de prueba: sólo vertical en venta, no guarda en el libro ni toca el PPP Maestro.
   Orden de carga (reparto-prueba.html): reparto.js, motor.js, definicion-tablas.js, definicion-reparto.js, pantalla.js y este archivo. */
(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const miles = (x) => (typeof x === 'number' && isFinite(x) ? (x < 0 ? '−' : '') + '$' + String(Math.round(Math.abs(x))).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '—');
  const mes = (x) => (typeof x === 'number' && isFinite(x) ? 'mes ' + x : '—');

  /* la definición base más la extensión del reparto, en pestañas (lo mismo que hace la suite con carga(…, { extension })) */
  function definicion(motor) {
    motor = motor || root.ArbolMotor;
    const base = root.ARBOL_TABLAS, ext = root.ARBOL_REPARTO_EXT;
    if (!motor || typeof motor.extiende !== 'function') return { errores: [{ mensaje: 'Falta el motor del Árbol con la extensión del reparto (motor.js de la copia de prueba).' }] };
    if (!base || !ext) return { errores: [{ mensaje: 'Faltan las tablas del Árbol o la extensión del reparto (definicion-tablas.js y definicion-reparto.js).' }] };
    if (!motor.moduloReparto()) return { errores: [{ mensaje: 'Falta el módulo de repartos (reparto.js).' }] };
    const x = motor.extiende(base, ext);
    if (x.errores.length) return { errores: x.errores };
    const c = motor.carga(x.definicion);
    return { fuente: x.definicion, definicion: c.definicion, errores: c.errores };
  }

  /* el estado del reparto de un plan, en HTML para el panel (sin red, sin escribir nada) */
  function estadoHtml(motor, def, plan) {
    const r = motor.reparto(def, plan);
    if (!r.ok) return '<section class="rp-estado" data-estado="SIN CALCULAR"><h2>Reparto · SIN CALCULAR</h2><p>' + esc(r.motivo) + '</p></section>';
    const b = r.bloque, x = r.resultado, f = b.fechas || {}, val = (k) => (f[k] ? f[k].valor : null);
    const fila = (a, c) => '<tr><th scope="row">' + esc(a) + '</th><td>' + c + '</td></tr>';
    let h = '<section class="rp-estado" data-estado="' + esc(b.estado) + '"><h2>Reparto · ' + esc(b.estado) + '</h2>';
    h += '<p class="rp-alcance">' + esc(b.alcance) + ' · opción ' + esc(b.opcion_reparto) + (b.opcion_titulo ? ' (' + esc(b.opcion_titulo) + ')' : '') + '</p><table class="rp-tabla">';
    h += fila('Corte autorizado', esc(val('corte_autorizado') !== null ? mes(val('corte_autorizado')) : 'sin fecha autorizada'));
    h += fila('Hito del motor (referencia del Árbol)', esc(mes(val('hito_motor'))));
    h += fila('Pago registrado', esc(val('pago_registrado') !== null ? mes(val('pago_registrado')) : 'sin pago registrado'));
    if (b.caja_repartible !== undefined) {
      h += fila('Corte', esc(b.corte + ' · mes ' + b.mes_corte));
      h += fila('Caja repartible', esc(miles(b.caja_repartible)));
      h += fila('Simulado · autorizado · pagado', esc(miles(b.totales.simulado) + ' · ' + miles(b.totales.autorizado) + ' · ' + miles(b.totales.pagado)));
      ['DUENO', 'ALIANZA', 'CAPITAL'].forEach((k) => { const c = b.conciliacion && b.conciliacion[k]; if (c) h += fila({ DUENO: 'Dueño', ALIANZA: 'Alianza', CAPITAL: 'Capital' }[k], esc('derecho ' + miles(c.derecho) + ' · autorizado ' + miles(c.autorizado) + ' · pagado ' + miles(c.pagado))); });
      const so = b.alianza_por_socio && b.alianza_por_socio.simulado;
      if (so) h += fila('Alianza por socio (simulado)', esc(Object.keys(so).map((k) => k + ' ' + miles(so[k])).join(' · ')));
    }
    h += '</table>';
    const mot = (b.motivos || []).concat(b.motivos_utilidades || []);
    h += mot.length ? '<h3>Por qué no se autoriza</h3><ul class="rp-motivos">' + mot.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>' : '<p class="rp-ok">Sin motivos de bloqueo en este corte.</p>';
    h += '<details><summary>Lo que la copia de prueba no implementa (se bloquea)</summary><ul>' + (b.no_implementado || []).map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></details>';
    if (b.fichas) {
      h += '<details class="rp-fichas"><summary>Datos de las fichas: vertical y Hub (' + esc(b.fichas.regla) + ')</summary><table class="rp-tabla"><thead><tr><th>Dato</th><th>Vertical</th><th>Hub</th></tr></thead><tbody>' +
        b.fichas.filas.map((q) => '<tr><th scope="row">' + esc(q[0] + ' · ' + q[1]) + '</th><td>' + esc(q[2]) + '</td><td>' + esc(q[3]) + '</td></tr>').join('') + '</tbody></table>' +
        (b.fichas.fallas.length ? '<p class="rp-mal">' + esc(b.fichas.fallas.join('; ')) + '</p>' : '') + '</details>';
    }
    return h + '</section>';
  }

  /* monta la pantalla con la definición extendida y vuelve a pintar el estado cada vez que la pantalla cambia */
  function arranca(host, panel, opciones) {
    const motor = (opciones && opciones.motor) || root.ArbolMotor, d = definicion(motor);
    if (d.errores && d.errores.length) { panel.innerHTML = '<section class="rp-estado"><h2>Reparto · no se pudo cargar</h2><p>' + esc(d.errores.map((e) => e.mensaje).join(' ')) + '</p></section>'; return null; }
    const api = root.ArbolPantalla.montar(host, { motor, tablas: d.fuente, proyecto: 'Copia de prueba · reparto (T-10)' });
    if (!api) { panel.innerHTML = '<section class="rp-estado"><h2>Reparto · no se pudo montar la pantalla</h2></section>'; return null; }
    let ultimo = '', t = null;
    const pinta = () => { const est = api.estado(); const k = JSON.stringify(est.plan); if (k === ultimo) return; ultimo = k; panel.innerHTML = estadoHtml(motor, api.DEF, est.plan); };
    pinta();
    if (root.MutationObserver) new root.MutationObserver(() => { clearTimeout(t); t = setTimeout(pinta, 120); }).observe(host, { childList: true, subtree: true });
    return api;
  }

  const api = { definicion, estadoHtml, arranca };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ArbolRepartoPrueba = api;
  if (typeof document !== 'undefined' && document.getElementById) {
    const go = () => { const host = document.getElementById('arbol-ppp'), panel = document.getElementById('reparto-estado'); if (host && panel) arranca(host, panel); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
