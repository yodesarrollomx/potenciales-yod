/*
 * Opciones del Plan de Potencial, lado a lado: el comparativo del visor en vivo.
 *
 * Una liga puede traer varias opciones del mismo proyecto: varios planes («varios terrenos») y, si el
 * renglón de la liga lo permite, varias versiones de cada uno. Esta página pide al servidor
 * (`?recurso=ppp2-visor&liga=…[&plan=…][&v=…]`, server/ppp2/Visor.gs) TODAS las opciones de la liga y
 * las pone en columnas, factor por factor, como la ficha técnica de dos coches.
 *
 * Reglas:
 *  - Sólo lee, sólo por GET. No hay motor financiero: cada factor es UNA cifra que el libro ya dio
 *    (`FACTORES` dice de dónde sale cada una). Aquí sólo se redondea como se enseña, se ordena, se
 *    compara contra la mejor y se cuentan las marcas. Ni TIR, ni márgenes, ni sumas nuevas.
 *  - Un valor que no llega (null, vacío o texto donde va número) se enseña «no aplica» y no lleva marca.
 *  - Flecha verde hacia arriba: la mejor opción del factor (todas, si empatan; ninguna, si todas
 *    empatan o hay menos de dos con cifra). Flecha roja hacia abajo: SÓLO si el factor declara umbral y
 *    la opción queda más allá de él respecto de la mejor.
 *  - La página no lleva nombres de planes, cifras ni identificadores: todo llega de la respuesta.
 *
 * Desde el visor se abre con la misma liga: `visor-comparar.html#l=<liga>` (ver docs/ppp2.md,
 * «Opciones y comparativo»).
 */
(function (root) {
  'use strict';
  var ENDPOINT = root.PPP2_ENDPOINT || 'https://script.google.com/macros/s/AKfycbywqwBh7uiD6DLmpTD6OUhzBX-AhkNxePhYgjn5Up3vAYdBzbV-2JyE7a5kKF_2QnO4/exec';
  var EN_PARALELO = 3;          // preguntas al servidor a la vez
  var MAX_OPCIONES = 18;        // seis planes por liga × tres versiones del libro

  /* ───────────────────────── los factores ─────────────────────────
     Los siete cuadros del visor, con los factores que mira un socio o un dueño de terreno.
     · de: de dónde sale la cifra en la respuesta del servidor: ['v', clave] = Resumen · v{n}.clave;
       ['datos', clave] = Datos; ['flujo', renglón] = total del renglón en «Flujo V{n}»; ['plan', clave].
     · u: cómo se enseña (y a qué precisión se compara: lo que se ve es lo que se compara).
     · sentido: 'mas' = más es mejor · 'menos' = menos es mejor · 'dato' = tamaño del proyecto: no hay
       mejor ni peor · 'orden' = texto del libro con orden (pasa > no pasa).
     · rojo: umbral de la flecha roja respecto de la mejor opción. { rel: 0.25 } = queda más de 25 %
       peor que la mejor; { abs: x } = queda más de x peor (puntos, meses o MDP, según la unidad);
       { orden: true } = queda en un escalón más bajo; null = el factor nunca pinta rojo.
     La tabla está escrita y explicada en docs/ppp2.md; si cambia aquí, cambia allá. */
  var GRUPOS = [
    { id: 'terreno', n: 1, titulo: 'Terreno' },
    { id: 'producto', n: 2, titulo: 'Producto' },
    { id: 'tiempo', n: 3, titulo: 'Tiempo' },
    { id: 'costo', n: 4, titulo: 'Costo y ganancia' },
    { id: 'dinero', n: 5, titulo: 'Dinero' },
    { id: 'reparto', n: 6, titulo: 'Reparto' },
    { id: 'riesgo', n: 7, titulo: 'Riesgo' }
  ];
  var FACTORES = [
    { k: 'terreno', g: 'terreno', nombre: 'Superficie del terreno', corto: 'superficie', de: ['datos', 'terreno.m2'], u: 'm2', sentido: 'dato', rojo: null },
    { k: 'tierra', g: 'terreno', nombre: 'Valor de la tierra', corto: 'valor de la tierra', de: ['v', 'tierra'], u: 'mdp', sentido: 'dato', rojo: null },
    { k: 'ventas', g: 'producto', nombre: 'Ventas totales', corto: 'ventas', de: ['v', 'ventas'], u: 'mdp', sentido: 'dato', rojo: null },
    { k: 'vendible', g: 'producto', nombre: 'Área vendible', corto: 'área vendible', de: ['datos', 'lamina.m2_vendibles'], u: 'm2', sentido: 'dato', rojo: null },
    { k: 'unidades', g: 'producto', nombre: 'Unidades', corto: 'unidades', de: ['flujo', 'firmas'], u: 'u', sentido: 'dato', rojo: null },
    { k: 'mes_reparto', g: 'tiempo', nombre: 'Plazo hasta el reparto', corto: 'plazo', de: ['v', 'mes_reparto'], u: 'meses', sentido: 'menos', rojo: { rel: 0.25 } },
    { k: 'rv_preventa', g: 'tiempo', nombre: 'Preventa al arrancar la obra', corto: 'preventa', de: ['v', 'rv_preventa'], u: 'pct', sentido: 'mas', rojo: { abs: 0.15 } },
    { k: 'costo_sin_tierra', g: 'costo', nombre: 'Costo sin tierra', corto: 'costo', de: ['v', 'costo_sin_tierra'], u: 'mdp', sentido: 'dato', rojo: null },
    { k: 'ganancia', g: 'costo', nombre: 'Ganancia real', corto: 'ganancia', de: ['v', 'ganancia'], u: 'mdp', sentido: 'mas', rojo: { rel: 0.25 } },
    { k: 'margen', g: 'costo', nombre: 'Ganancia sobre ventas', corto: 'ganancia sobre ventas', de: ['v', 'margen'], u: 'pct', sentido: 'mas', rojo: { abs: 0.05 } },
    { k: 'costo_dinero', g: 'costo', nombre: 'Costo del dinero', corto: 'costo del dinero', de: ['v', 'costo_dinero'], u: 'mdp', sentido: 'menos', rojo: null },
    { k: 'max_ajeno', g: 'dinero', nombre: 'Dinero ajeno, máximo', corto: 'dinero ajeno', de: ['v', 'max_ajeno'], u: 'mdp', sentido: 'menos', rojo: { rel: 0.25 } },
    { k: 'banco_max', g: 'dinero', nombre: 'Crédito del banco, saldo máximo', corto: 'crédito del banco', de: ['v', 'banco_max'], u: 'mdp', sentido: 'menos', rojo: null },
    { k: 'capital', g: 'dinero', nombre: 'Capital aportado', corto: 'capital', de: ['v', 'capital'], u: 'mdp', sentido: 'menos', rojo: null },
    { k: 'respaldo', g: 'dinero', nombre: 'Dinero que faltaría', corto: 'dinero que faltaría', de: ['v', 'respaldo'], u: 'mdp', sentido: 'menos', rojo: { abs: 0.05 } },
    { k: 'dueno_recibe', g: 'reparto', nombre: 'El dueño recibe', corto: 'lo que recibe el dueño', de: ['v', 'dueno_recibe'], u: 'mdp', sentido: 'mas', rojo: { rel: 0.25 } },
    { k: 'dueno_veces', g: 'reparto', nombre: 'Veces el valor de su tierra', corto: 'veces su tierra', de: ['v', 'dueno_veces'], u: 'veces', sentido: 'mas', rojo: { rel: 0.25 } },
    { k: 'dueno_meses', g: 'reparto', nombre: 'El dueño cobra lo último', corto: 'cuándo cobra el dueño', de: ['v', 'dueno_meses'], u: 'mes', sentido: 'menos', rojo: null },
    { k: 'alianza_recibe', g: 'reparto', nombre: 'La alianza recibe', corto: 'lo que recibe la alianza', de: ['v', 'alianza_recibe'], u: 'mdp', sentido: 'mas', rojo: { rel: 0.25 } },
    { k: 'rv_resultado', g: 'riesgo', nombre: 'Revisión para fondos', corto: 'revisión para fondos', de: ['v', 'rv_resultado'], u: 'texto', sentido: 'orden', rojo: { orden: true } },
    { k: 'rv_margen', g: 'riesgo', nombre: 'Margen antes de financiamiento, sobre costo', corto: 'margen sobre costo', de: ['v', 'rv_margen'], u: 'pct', sentido: 'mas', rojo: null },
    { k: 'rv_aportacion', g: 'riesgo', nombre: 'Aportación: tierra y capital entre costo', corto: 'aportación', de: ['v', 'rv_aportacion'], u: 'pct', sentido: 'mas', rojo: null },
    { k: 'rv_cobertura', g: 'riesgo', nombre: 'Cobertura: por cobrar entre saldo del banco', corto: 'cobertura', de: ['v', 'rv_cobertura'], u: 'veces', sentido: 'mas', rojo: null },
    { k: 'candados', g: 'riesgo', nombre: 'Candados abiertos', corto: 'candados', de: ['plan', 'candados_abiertos'], u: 'num', sentido: 'menos', rojo: null },
    { k: 'pago_anticipo', g: 'reparto', nombre: 'Anticipo incluido en el pago', corto: 'anticipo', de: ['v', 'pago_anticipo'], u: 'mdp', sentido: 'dato', rojo: null, especie: true },
    { k: 'pago_vivienda', g: 'reparto', nombre: 'Pago restante en viviendas', corto: 'viviendas adjudicadas', de: ['v', 'pago_vivienda'], u: 'mdp', sentido: 'dato', rojo: null, especie: true },
    { k: 'pago_cobros', g: 'dinero', nombre: 'Cobros de terceros, sin adjudicaciones', corto: 'cobros de terceros', de: ['v', 'pago_cobros'], u: 'mdp', sentido: 'dato', rojo: null, especie: true },
    { k: 'pago_resultado', g: 'reparto', nombre: 'Resultado neto del desarrollador', corto: 'resultado del desarrollador', de: ['v', 'pago_resultado'], u: 'mdp', sentido: 'mas', rojo: { abs: 0.05 }, especie: true }
  ];
  /* A qué precisión se enseña (y se compara) cada unidad: número de decimales de la cifra cruda. */
  var DECIMALES = { mdp: 1, m2: 0, u: 0, meses: 0, mes: 0, pct: 3, veces: 2, num: 0 };
  var EPS = 1e-9;

  /* ───────────────────────── utilidades ───────────────────────── */
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function miles(s) { var p = String(s).split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.join('.'); }
  function corta(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function redondea(x, dec) { return Number(x.toFixed(dec)) + 0; }   // + 0: sin «-0»
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fecha(x) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(String(x || ''));
    return m ? Number(m[3]) + '-' + MES[Number(m[2]) - 1] + '-' + m[1] + (m[4] ? ' ' + m[4] : '') : '';
  }
  function lista(xs) { return xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]; }

  /* ───────────────────────── cada cifra, tal como llega ───────────────────────── */
  function crudo(f, d) {
    var a = f.de[0], c = f.de[1];
    if (!d) return null;
    if (f.k === 'unidades' && d.v && d.v.pago_especie === true) {
      var productos = d.productos;
      return Array.isArray(productos) && productos.length && productos.every(function (p) { return p && num(p.unidades) !== null; })
        ? productos.reduce(function (n, p) { return n + p.unidades; }, 0) : null;
    }
    if (a === 'v') return d.v ? d.v[c] : null;
    if (a === 'datos') return d.datos && d.datos[c] ? d.datos[c].valor : null;
    if (a === 'flujo') return d.flujo && d.flujo.total ? d.flujo.total[c] : null;
    if (a === 'plan') return d.plan ? d.plan[c] : null;
    return null;
  }
  /* Revisión para fondos: lo que dice el libro (`v{n}.rv_resultado`), con su escalón. */
  function nivelRevision(t) {
    t = String(t || '').trim();
    if (/^no pasa/i.test(t)) return 0;
    if (/^pasa/i.test(t)) return 1;
    return null;
  }
  function textoRevision(t) {
    t = String(t || '').trim();
    var nf = /(\d+)\s+de\s+(\d+)/.exec(t);
    if (/^no pasa/i.test(t)) return 'No pasa' + (nf ? ' · ' + nf[1] + ' de ' + nf[2] : '');
    var j = /^pasa\s*\(([^)]+)\)/i.exec(t);
    if (j) return 'Pasa · ' + corta(j[1], 22);
    return /^pasa/i.test(t) ? 'Pasa' : corta(t, 28);
  }
  /* { x: la cifra a la precisión con que se enseña (o el escalón), texto: como se enseña }. x = null: no aplica. */
  function valor(f, d) {
    var c = crudo(f, d);
    if (f.u === 'texto') {
      var t = typeof c === 'string' ? c.trim() : '';
      return { x: t ? nivelRevision(t) : null, texto: t ? textoRevision(t) : 'no aplica', hay: !!t };
    }
    var x = num(c);
    if (x === null) return { x: null, texto: 'no aplica', hay: false };
    x = redondea(x, DECIMALES[f.u]);
    return { x: x, texto: formato(f.u, x), hay: true };
  }
  function formato(u, x) {
    var neg = x < 0 ? '−' : '', a = Math.abs(x);
    if (u === 'mdp') return neg + '$' + miles(a.toFixed(1));
    if (u === 'm2') return neg + miles(a.toFixed(0)) + ' m²';
    if (u === 'u') return neg + miles(a.toFixed(0)) + ' u';
    if (u === 'meses') return neg + miles(a.toFixed(0)) + (a === 1 ? ' mes' : ' meses');
    if (u === 'mes') return 'mes ' + neg + a.toFixed(0);
    if (u === 'pct') return neg + (a * 100).toFixed(1) + '%';
    if (u === 'veces') return neg + a.toFixed(2) + '×';
    return neg + miles(a.toFixed(0));
  }
  function deDonde(f, d) {
    var a = f.de[0], c = f.de[1], n = (d && d.version) || '';
    var pre = d && d.origen ? String(d.origen) + ' · ' : 'Libro · ';
    if (f.k === 'unidades' && d && d.v && d.v.pago_especie === true) return pre + 'Productos · unidades totales, incluidas las adjudicadas sin cobro';
    if (a === 'v') return pre + 'Resumen · v' + n + '.' + c;
    if (a === 'datos') return pre + 'Datos · ' + c;
    if (a === 'flujo') return pre + 'Flujo V' + n + ' · total de «' + ({ firmas: 'Total de unidades' }[c] || c) + '»';
    return pre + 'Resumen · plan.' + c;
  }
  function textoUmbral(f) {
    var r = f.rojo;
    if (!r) return '';
    if (r.orden) return 'rojo si no pasa y otra sí';
    if (r.rel) return 'rojo a más de ' + Math.round(r.rel * 100) + ' % de la mejor';
    if (f.u === 'pct') return 'rojo a más de ' + Math.round(r.abs * 100) + ' puntos de la mejor';
    if (f.u === 'mdp') return 'rojo si le falta más que a la mejor';
    return 'rojo a más de ' + r.abs + ' de la mejor';
  }
  function textoSentido(f) {
    return { mas: 'más es mejor', menos: 'menos es mejor', dato: 'dato · sin mejor ni peor', orden: 'pasar es mejor' }[f.sentido];
  }

  /* ───────────────────────── comparar ───────────────────────── */
  /* ¿La opción con `x` queda más allá del umbral rojo respecto de la mejor (`m`)? */
  function muyAbajo(f, x, m) {
    var r = f.rojo;
    if (!r || x === null || m === null || x === m) return false;
    var peor = f.sentido === 'menos' ? x - m : m - x;     // cuánto peor, en las unidades del factor
    if (peor <= EPS) return false;
    if (r.orden) return true;
    if (r.abs != null) return peor > r.abs + EPS;
    if (r.rel != null) return m !== 0 && peor / Math.abs(m) > r.rel + EPS;
    return false;
  }
  /* Para cada factor: los valores de cada opción, cuáles son la mejor, cuáles quedan muy por debajo y la
     escala de la barrita (siempre desde cero). */
  function compara(ops) {
    return FACTORES.filter(function (f) { return !f.especie || ops.some(function (o) { return o.d && o.d.v && o.d.v.pago_especie === true; }); }).map(function (f) {
      var vals = ops.map(function (o) { return valor(f, o.d); });
      var con = [], i;
      for (i = 0; i < vals.length; i++) if (vals[i].x !== null) con.push(i);
      var r = { f: f, vals: vals, mejor: [], rojo: [], lo: 0, hi: 0, compara: false };
      if (f.u !== 'texto') con.forEach(function (j) { r.lo = Math.min(r.lo, vals[j].x); r.hi = Math.max(r.hi, vals[j].x); });
      if (f.sentido === 'dato' || con.length < 2) return r;
      var xs = con.map(function (j) { return vals[j].x; });
      var m = f.sentido === 'menos' ? Math.min.apply(null, xs) : Math.max.apply(null, xs);
      r.compara = true;
      if (xs.every(function (x) { return x === m; })) return r;          // todas iguales: nada que marcar
      r.mejor = con.filter(function (j) { return vals[j].x === m; });
      r.rojo = con.filter(function (j) { return muyAbajo(f, vals[j].x, m); });
      return r;
    });
  }
  /* Cuántas veces es la mejor cada opción, y en qué; y en qué queda muy por debajo. Sólo cuenta. */
  function resumen(ops, filas) {
    var cuenta = ops.map(function (o, i) { return { i: i, nombre: o.nombre, gana: [], abajo: [] }; });
    var comparables = 0;
    filas.forEach(function (r) {
      if (r.compara) comparables++;
      r.mejor.forEach(function (i) { cuenta[i].gana.push(r.f.corto); });
      r.rojo.forEach(function (i) { cuenta[i].abajo.push(r.f.corto); });
    });
    var orden = cuenta.slice().sort(function (a, b) { return b.gana.length - a.gana.length || a.i - b.i; });
    return { comparables: comparables, cuenta: cuenta, orden: orden };
  }

  /* ───────────────────────── las opciones de la liga ─────────────────────────
     `pide(params)` hace UNA pregunta GET al servidor (con la liga ya puesta) y devuelve su respuesta.
     Primero la de la liga tal cual (trae los planes y las versiones que deja ver), luego la versión que
     se muestra de cada otro plan, luego cada otra versión. Lo que el servidor no deja ver no se pide. */
  function claveDe(d) { return String((d.menu && d.menu.plan) || '') + '|' + String(d.version || ''); }
  function lote(tareas, n, alTerminar) {
    return new Promise(function (ok) {
      var out = new Array(tareas.length), sig = 0, vivas = 0, hechas = 0;
      if (!tareas.length) { ok(out); return; }
      function lanza() {
        while (vivas < n && sig < tareas.length) {
          (function (i) {
            vivas++;
            Promise.resolve().then(tareas[i]).then(function (v) { out[i] = v; }, function () { out[i] = null; }).then(function () {
              vivas--; hechas++;
              if (alTerminar) alTerminar();
              if (hechas === tareas.length) ok(out); else lanza();
            });
          })(sig++);
        }
      }
      lanza();
    });
  }
  function reune(pide, alAvance) {
    var tengo = {}, fallas = 0, total = 1, listas = 0;
    var avisa = function () { listas++; if (alAvance) alAvance(listas, total); };
    var guarda = function (d) { if (d && d.ok && !d.igual && d.menu) tengo[claveDe(d)] = d; else fallas++; return d; };
    return Promise.resolve(pide({ abre: true })).then(function (r0) {
      if (!r0 || !r0.ok) return { ok: false, error: (r0 && r0.error) || 'red' };
      avisa();
      guarda(r0);
      var planes = (r0.menu.planes && r0.menu.planes.length ? r0.menu.planes : [{ id: r0.menu.plan, etiqueta: '' }]).slice(0, 6);
      var otros = planes.filter(function (p) { return p.id !== r0.menu.plan; });
      total += otros.length;
      return lote(otros.map(function (p) { return function () { return pide({ plan: p.id }); }; }), EN_PARALELO, null).then(function (rs) {
        rs.forEach(function (r) { avisa(); guarda(r); });
        var porPlan = {};
        Object.keys(tengo).forEach(function (k) { porPlan[tengo[k].menu.plan] = tengo[k]; });
        var faltan = [];
        planes.forEach(function (p) {
          var d = porPlan[p.id];
          if (!d) return;
          (d.versiones || []).forEach(function (x) { if (!tengo[p.id + '|' + x.n]) faltan.push({ plan: p.id, v: x.n }); });
        });
        faltan = faltan.slice(0, Math.max(0, MAX_OPCIONES - Object.keys(tengo).length));
        total += faltan.length;
        return lote(faltan.map(function (q) { return function () { return pide({ plan: q.plan, v: q.v }); }; }), EN_PARALELO, null).then(function (rs2) {
          rs2.forEach(function (r) { avisa(); guarda(r); });
          return { ok: true, opciones: opciones(planes, tengo), fallas: fallas, marcas: r0.marcas || null };
        });
      });
    });
  }
  /* Las columnas, en el orden de la liga: planes como los lista la liga y, dentro, versiones del libro. */
  function opciones(planes, tengo) {
    var porPlan = {}, out = [];
    Object.keys(tengo).forEach(function (k) { var d = tengo[k]; (porPlan[d.menu.plan] = porPlan[d.menu.plan] || []).push(d); });
    var variosPlanes = planes.filter(function (p) { return porPlan[p.id]; }).length > 1;
    var variasVersiones = Object.keys(porPlan).some(function (k) { return porPlan[k].length > 1; });
    planes.forEach(function (p) {
      var ds = (porPlan[p.id] || []).slice(), orden = {};
      if (!ds.length) return;
      (ds[0].versiones || []).forEach(function (x, i) { orden[x.n] = i; });
      ds.sort(function (a, b) { return (orden[a.version] == null ? 99 : orden[a.version]) - (orden[b.version] == null ? 99 : orden[b.version]) || a.version - b.version; });
      ds.forEach(function (d) {
        var meta = (d.versiones || []).filter(function (x) { return x.n === d.version; })[0] || {};
        var vnombre = String(meta.nombre || (d.v && d.v.nombre) || '').trim();
        var estado = String(meta.estado || (d.v && d.v.estado) || '').trim().toLowerCase();
        var etiqueta = String(p.etiqueta || (d.plan && d.plan.nombre) || '').trim();
        var ver = 'V' + d.version + (vnombre ? ' · ' + vnombre : '');
        var nombre = variosPlanes ? corta(etiqueta || 'Plan', 26) + (variasVersiones ? ' · V' + d.version : '') : corta(ver, 30);
        out.push({
          plan: p.id, v: d.version, d: d, nombre: nombre, etiqueta: etiqueta,
          version: variosPlanes && variasVersiones ? corta(ver, 30) : '', estado: estado,
          /* «la que se muestra» sólo dice algo si de ese plan hay más de una versión en la tabla */
          mostrada: ds.length > 1 && !!(d.plan && Number(d.plan.mostrada) === d.version)
        });
      });
    });
    return out;
  }

  /* ───────────────────────── pintar ───────────────────────── */
  var FLECHA = {
    mejor: '<svg class="vc-fl vc-fl-mejor" viewBox="0 0 12 12" width="12" height="12" role="img" aria-label="mejor"><title>mejor</title><path d="M6 1.5 10.5 7.2H7.6V10.5H4.4V7.2H1.5Z"></path></svg>',
    rojo: '<svg class="vc-fl vc-fl-rojo" viewBox="0 0 12 12" width="12" height="12" role="img" aria-label="muy por debajo"><title>muy por debajo</title><path d="M6 10.5 1.5 4.8H4.4V1.5H7.6V4.8H10.5Z"></path></svg>'
  };
  function barra(r, val, clase) {
    if (r.f.u === 'texto' || val.x === null) return '';
    var lo = r.lo, hi = r.hi, ancho = hi - lo;
    if (!(ancho > 0)) return '<span class="vc-barra" aria-hidden="true"></span>';
    var cero = (0 - lo) / ancho * 100, a = Math.min(cero, (val.x - lo) / ancho * 100), b = Math.max(cero, (val.x - lo) / ancho * 100);
    var w = Math.max(b - a, val.x !== 0 ? 1.5 : 0);
    return '<span class="vc-barra' + (lo < 0 ? ' vc-con-cero' : '') + '" aria-hidden="true"' + (lo < 0 ? ' style="--cero:' + cero.toFixed(1) + '%"' : '') + '>' +
      '<i class="' + clase + (val.x < 0 ? ' vc-neg' : '') + '" style="left:' + a.toFixed(1) + '%;width:' + w.toFixed(1) + '%"></i></span>';
  }
  function celda(r, i, o) {
    var val = r.vals[i], mejor = r.mejor.indexOf(i) >= 0, rojo = r.rojo.indexOf(i) >= 0;
    var clase = !val.hay ? 'vc-na' : (mejor ? 'vc-mejor' : (rojo ? 'vc-rojo' : (r.f.sentido === 'dato' ? 'vc-dato' : '')));
    var nivel = r.f.u === 'texto' && val.hay ? (val.x === 1 ? ' vc-pasa' : (val.x === 0 ? ' vc-nopasa' : '')) : '';
    var titulo = r.f.nombre + ': ' + val.texto + (mejor ? ' · mejor' : '') + (rojo ? ' · muy por debajo' : '') + (val.hay ? ' · ' + deDonde(r.f, o.d) : '');
    return '<td class="vc-c ' + clase + '" title="' + esc(titulo) + '"><span class="vc-v"><span class="vc-num' + nivel + '">' + esc(val.texto) + '</span>' +
      (mejor ? FLECHA.mejor : '') + (rojo ? FLECHA.rojo : '') + '</span>' + barra(r, val, mejor ? 'vc-b-mejor' : (rojo ? 'vc-b-rojo' : (r.f.sentido === 'dato' ? 'vc-b-dato' : ''))) + '</td>';
  }
  function cabeza(o, i, rs) {
    var terreno = valor(FACTORES[0], o.d), gana = rs.cuenta[i].gana.length;
    var est = o.estado ? o.estado + (o.estado === 'vigente' ? ' ✓' : '') : (o.mostrada ? 'la que se muestra' : '');
    return '<th scope="col" class="vc-op"><span class="vc-op-n">' + esc(o.nombre) + '</span>' +
      (o.version ? '<span class="vc-op-s">' + esc(o.version) + '</span>' : '') +
      '<span class="vc-op-s">' + (terreno.hay ? esc(terreno.texto) : 'terreno: no aplica') + (est ? ' · ' + esc(est) : '') + '</span>' +
      '<span class="vc-op-g">' + (gana ? FLECHA.mejor + ' mejor en ' + gana : 'sin factores a favor') + '</span></th>';
  }
  /* El encabezado: cuál opción es la mejor en más factores y en cuáles; luego las demás; luego dónde
     queda alguna muy por debajo. Sólo cuenta marcas: sin adjetivos. */
  function frase(rs) {
    var o = [], top = rs.orden, n = rs.comparables, g0 = top.length ? top[0].gana.length : 0;
    if (!n) return ['<p>Las opciones no traen cifras comparables: los factores salen «no aplica».</p>'];
    var q = function (x) { return '«' + esc(x.nombre) + '»'; };
    var cuales = function (x) { return esc(lista(x.gana)); };
    if (!g0) o.push('<p>Ninguna opción es la mejor en algún factor: en los ' + n + ' factores comparables dan lo mismo.</p>');
    else {
      var primeros = top.filter(function (x) { return x.gana.length === g0; });
      if (primeros.length > 1) {
        o.push('<p><b>Empatan ' + lista(primeros.map(q)) + '</b>: cada una es la mejor en ' + g0 + ' de ' + n + ' factores comparables.</p>');
        o.push('<p>' + primeros.map(function (x) { return q(x) + ': ' + cuales(x); }).join('. ') + '.</p>');
      } else o.push('<p><b>' + q(top[0]) + ' es la mejor en ' + g0 + ' de ' + n + ' factores comparables</b>: ' + cuales(top[0]) + '.</p>');
      /* las demás: con sus factores si son pocas; con muchas opciones, sólo cuántos (la tabla dice cuáles) */
      var resto = top.filter(function (x) { return primeros.indexOf(x) < 0 && x.gana.length; });
      if (resto.length && top.length <= 4) o.push('<p>' + resto.map(function (x) { return q(x) + ', en ' + x.gana.length + ': ' + cuales(x); }).join('. ') + '.</p>');
      else if (resto.length) o.push('<p>Las demás: ' + resto.map(function (x) { return q(x) + ' en ' + x.gana.length; }).join(', ') + '.</p>');
      var sin = top.filter(function (x) { return !x.gana.length; });
      if (sin.length) o.push('<p>' + lista(sin.map(q)) + (sin.length > 1 ? ' no son' : ' no es') + ' la mejor en ningún factor.</p>');
    }
    var abajo = rs.cuenta.filter(function (x) { return x.abajo.length; }), marcas = 0;
    abajo.forEach(function (x) { marcas += x.abajo.length; });
    var dice = marcas <= 6 ? function (x) { return q(x) + ' en ' + esc(lista(x.abajo)); } : function (x) { return q(x) + ' en ' + x.abajo.length + (x.abajo.length === 1 ? ' factor' : ' factores'); };
    o.push(abajo.length ? '<p class="vc-abajo">' + FLECHA.rojo + ' Muy por debajo de la mejor: ' + abajo.map(dice).join('; ') + '.</p>'
      : '<p class="vc-abajo">Ninguna opción queda muy por debajo de la mejor en los factores que llevan umbral.</p>');
    return o;
  }
  function marcasHtml(marcas) {
    if (!marcas || !marcas.length) return '';
    return '<div class="vc-marcas">' + marcas.map(function (m) {
      return m && m.img && /^data:image\//.test(m.img) ? '<img src="' + esc(m.img) + '" alt="' + esc(m.nombre) + '">' : '<span>' + esc(m && m.nombre) + '</span>';
    }).join('') + '</div>';
  }
  var CANDADO = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';
  var AVISO = 'Confidencial · quien tenga esta liga ve el plan. No la reenvíes.';
  function pie(marcas) {
    return '<footer class="vc-pie">' + marcasHtml(marcas) + '<p>' + CANDADO + AVISO + '</p></footer>';
  }
  /* Al imprimir, las marcas y el aviso van arriba (el pie de cada hoja repite el aviso y el número de página). */
  function impreso(marcas) {
    return '<div class="vc-impreso">' + marcasHtml(marcas) + '<p>' + CANDADO + AVISO + '</p></div>';
  }
  function datosDe(ops) {
    var leido = '', cambio = '';
    ops.forEach(function (o) {
      if (String(o.d.leido || '') > leido) leido = String(o.d.leido);
      if (String(o.d.cambio || '') > cambio) cambio = String(o.d.cambio);
    });
    return { leido: leido, cambio: cambio };
  }
  function nombreComun(ops) {
    var ns = ops.map(function (o) { return String((o.d.plan && o.d.plan.nombre) || '').trim(); });
    return ns[0] && ns.every(function (n) { return n === ns[0]; }) ? ns[0] : '';
  }
  /* La página completa. `extra`: { liga, marcas, fallas }. */
  function pinta(ops, extra) {
    extra = extra || {};
    var nombre = nombreComun(ops), visor = extra.liga ? 'visor.html#l=' + encodeURIComponent(extra.liga) : '';
    var cuando = datosDe(ops);
    var encabezado = '<header class="vc-top"><div class="vc-l1"><span class="vc-marca">YoDesarrollo · Plan de Potencial</span><span class="vc-sello">Comparativo de opciones</span></div>' +
      '<h1>' + esc(nombre || 'Opciones del plan') + '</h1>' +
      '<p class="vc-datos">' + (cuando.leido ? 'Datos leídos del libro el ' + esc(fecha(cuando.leido)) : 'Datos del libro') + (cuando.cambio ? ' · último cambio del libro: ' + esc(fecha(cuando.cambio)) : '') + '</p>';
    if (ops.length < 2) {
      return {
        filas: [], resumen: null,
        html: encabezado + '<div class="vc-una"><p><b>Esta liga trae una sola opción' + (ops.length ? ' («' + esc(ops[0].nombre) + '»)' : '') + '</b>: no hay otra con qué compararla.</p>' +
          (visor ? '<p><a class="vc-boton" href="' + esc(visor) + '">Ver el plan en el visor</a></p>' : '') + '</div>' + impreso(extra.marcas) + '</header>' + pie(extra.marcas)
      };
    }
    var filas = compara(ops), rs = resumen(ops, filas);
    var cols = ops.length + 1;
    var tabla = '<div class="vc-caja" tabindex="0" role="region" aria-label="Tabla comparativa: desliza de lado para ver todas las opciones">' +
      '<table class="vc-tabla vc-n' + Math.min(ops.length, 12) + '"><caption class="vc-oculto">Factores de cada opción, agrupados como los siete cuadros del visor</caption>' +
      '<thead><tr><th scope="col" class="vc-fac vc-esq">Factor</th>' + ops.map(function (o, i) { return cabeza(o, i, rs); }).join('') + '</tr></thead>' +
      GRUPOS.map(function (g) {
        var fs = filas.filter(function (r) { return r.f.g === g.id; });
        return '<tbody class="vc-grupo"><tr class="vc-gt"><th scope="colgroup" colspan="' + cols + '"><span>' + g.n + ' · ' + esc(g.titulo) + '</span></th></tr>' +
          fs.map(function (r) {
            var umbral = textoUmbral(r.f);
            return '<tr data-factor="' + r.f.k + '"><th scope="row" class="vc-fac"' + (umbral ? ' title="' + esc(umbral) + '"' : '') + '><span class="vc-fn">' + esc(r.f.nombre) + '</span>' +
              '<span class="vc-fs">' + esc(textoSentido(r.f)) + (umbral ? '<span class="vc-fu"> · ' + esc(umbral) + '</span>' : '') + '</span></th>' +
              ops.map(function (o, i) { return celda(r, i, o); }).join('') + '</tr>';
          }).join('') + '</tbody>';
      }).join('') + '</table></div>';
    var avisos = '';
    if (extra.fallas) avisos += '<p class="vc-aviso">No pude leer ' + extra.fallas + (extra.fallas === 1 ? ' opción' : ' opciones') + ' de la liga: no salen en la tabla.</p>';
    if (ops.some(function (o) { return o.d.a_medias; })) avisos += '<p class="vc-aviso">El plan está recalculando una de estas versiones: sus cifras pueden moverse.</p>';
    var html = encabezado +
      '<div class="vc-resumen">' + frase(rs).join('') + '</div>' +
      '<div class="vc-acciones"><button type="button" class="vc-boton" id="vcPdf">Descargar PDF</button>' + (visor ? '<a class="vc-boton vc-sec" href="' + esc(visor) + '">Ver el visor</a>' : '') + '</div>' +
      '<p class="vc-leyenda">' + FLECHA.mejor + ' la mejor opción del factor · ' + FLECHA.rojo + ' muy por debajo de la mejor (cada factor dice su umbral) · «dato»: tamaño del proyecto, sin mejor ni peor · $ en millones de pesos (MDP)</p>' +
      avisos + impreso(extra.marcas) + '</header>' + tabla + pie(extra.marcas);
    return { html: html, filas: filas, resumen: rs };
  }
  function mensaje(titulo, texto, boton) {
    return '<div class="vc-msg"><h1>' + esc(titulo) + '</h1><p>' + esc(texto) + '</p>' + (boton ? '<button type="button" class="vc-boton" id="vcOtra">' + esc(boton) + '</button>' : '') + '</div>';
  }

  var api = { FACTORES: FACTORES, GRUPOS: GRUPOS, valor: valor, compara: compara, resumen: resumen, muyAbajo: muyAbajo, reune: reune, opciones: opciones, pinta: pinta, mensaje: mensaje, textoUmbral: textoUmbral, ENDPOINT: ENDPOINT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VisorCompara = api;
  if (!root.document || !root.document.getElementById || !root.document.getElementById('vc')) return;   // sólo la página sigue de aquí

  /* ───────────────────────── la página: por liga ───────────────────────── */
  var doc = root.document, caja = doc.getElementById('vc');
  function ligaDeLaDireccion() {
    var m = /[#&?]l=([A-Za-z0-9_-]{24,80})(?:&|$)/.exec(root.location.hash || '') || /[?&]l=([A-Za-z0-9_-]{24,80})(?:&|$)/.exec(root.location.search || '');
    return m ? m[1] : '';
  }
  function equipo() {
    var u = root.navigator.userAgent || '';
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'otro';
  }
  /* Una pregunta GET con la liga. La primera lleva `abre=1` (trae las marcas del pie y deja UN renglón en
     Aperturas, como el visor; el equipo va con «· comparar» para distinguirlo). Sólo GET: nunca escribe. */
  function pideCon(liga) {
    return function (q) {
      var s = '?recurso=ppp2-visor&liga=' + encodeURIComponent(liga) + (q.plan ? '&plan=' + encodeURIComponent(q.plan) : '') + (q.v ? '&v=' + encodeURIComponent(q.v) : '') +
        (q.abre ? '&abre=1&eq=' + encodeURIComponent(equipo() + ' · comparar') : '');
      var ctl = root.AbortController ? new root.AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
      return root.fetch(ENDPOINT + s, { method: 'GET', credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined })
        .then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
    };
  }
  function carga() {
    var liga = ligaDeLaDireccion();
    if (!liga) { caja.innerHTML = mensaje('Falta la liga', 'Abre el comparativo desde la liga completa que te compartieron.'); return; }
    caja.innerHTML = mensaje('Juntando las opciones…', 'Leyendo el libro de cada una.');
    var p = caja.querySelector('.vc-msg p');
    reune(pideCon(liga), function (n, de) { if (p) p.textContent = 'Leí ' + n + ' de ' + de + (de === 1 ? ' opción.' : ' opciones.'); }).then(function (r) {
      if (!r.ok) {
        if (r.error === 'liga' || r.error === 'plan') caja.innerHTML = mensaje('Esta liga ya no está activa', 'Pide una nueva a quien te la compartió.');
        else caja.innerHTML = mensaje('No pude abrir el plan', 'Vuelve a intentar en un momento.', 'Intentar de nuevo');
        return;
      }
      var hoja = pinta(r.opciones, { liga: liga, marcas: r.marcas, fallas: r.fallas });
      caja.innerHTML = hoja.html;
      cabe();
      var nombre = nombreComun(r.opciones);
      doc.title = 'Comparativo · ' + (nombre || 'Plan de Potencial');
    }).catch(function () { caja.innerHTML = mensaje('No pude abrir el plan', 'Revisa tu conexión y vuelve a intentar.', 'Intentar de nuevo'); });
  }
  /* Si la tabla cabe completa a lo ancho (escritorio), deja de ser una caja que se desliza: la página
     baja entera y la fila de opciones se queda arriba. Si no cabe (teléfono, muchas opciones), se
     desliza de lado y a lo alto dentro de su caja, con la columna de factores y la fila de opciones fijas. */
  function cabe() {
    var c = caja.querySelector('.vc-caja'), t = c && c.querySelector('.vc-tabla');
    if (!t) return;
    c.classList.remove('vc-cabe');                           // se mide a su ancho natural, no al de la caja
    c.classList.toggle('vc-cabe', root.innerWidth >= 760 && t.offsetWidth <= c.clientWidth + 1);
  }
  root.addEventListener('resize', cabe);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(cabe);
  caja.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    if (t.id === 'vcPdf') root.print();                     // «Descargar PDF»: la hoja de impresión deja la página en carta horizontal
    else if (t.id === 'vcOtra') carga();
  });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', carga); else carga();
})(typeof window !== 'undefined' ? window : globalThis);
