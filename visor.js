/*
 * Visor en vivo del Plan de Potencial (PPP 2) — una pantalla, siete cuadros.
 *
 * Sólo presentación: pinta lo que el servidor leyó del libro del plan (`?recurso=ppp2-visor&liga=…`,
 * server/ppp2/Visor.gs). Aquí no hay motor financiero. Lo único que la página hace con las cifras
 * del libro es acomodarlas para dibujar: partes de un total, sumas por trimestre de renglones
 * mensuales, la diferencia contra el límite de una prueba. Cada cifra dice de dónde sale al tocarla.
 *
 * La liga llega en la dirección (`#l=…`; también `?l=…`). Sin liga viva no se pinta nada.
 * Este archivo no lleva nombres de planes, cifras ni identificadores de libros.
 */
(function (root) {
  'use strict';
  var ENDPOINT = root.PPP2_ENDPOINT || 'https://script.google.com/macros/s/AKfycbywqwBh7uiD6DLmpTD6OUhzBX-AhkNxePhYgjn5Up3vAYdBzbV-2JyE7a5kKF_2QnO4/exec';
  var CADA_MS = Number(root.PPP2_VISOR_MS) || 5000;   // cada cuánto se pregunta «¿cambió el libro?» (sólo con la página a la vista)

  /* ───────────────────────── colores y medidas ───────────────────────── */
  var INK = '#231d14', MUTED = '#6e675a', BODY = '#4a4336', ORO = '#7d5f1e', GRIS = '#8a8272';
  var CLI = '#39744b', CLIT = '#2b5b39', BAN = '#3b352c', CAP = '#3e6484', CAPT = '#2c4a63', OBR = '#b06a5f', OBRT = '#8a4a40';
  var RES = '#8f7a9e', REST = '#5f4f6e', TIE = '#9a7b3f', BAD = '#a94438', BADT = '#7f2f26', AMB = '#c98a2b', AMBT = '#8a5a12';
  var PRODUCTO = ['#9a7b3f', '#3e6484', '#3f7a78', '#39744b', '#8f5b4a', '#6b5b86'];
  var SERIF = "'Instrument Serif', Georgia, serif";
  var EDADES = ['semilla', 'plántula', 'árbol', 'flor', 'fruto'];

  /* Las nueve pruebas de la revisión para fondos. El límite (`lim`) es el del libro (plantilla
     ppp2-libro-v1, «REVISIÓN PARA FONDOS»: lo vigila tests/ppp2-visor-pagina.test.cjs); el otro lado
     del rango (`tope`) es sólo la escala del dibujo. */
  var PRUEBAS = [
    { k: 'rv_linea_ventas', nombre: 'Línea / ventas', largo: 'Línea del banco entre ventas', modo: 'max', lim: 0.65, tope: 0, u: '%' },
    { k: 'rv_linea_costo', nombre: 'Línea / costo', largo: 'Línea del banco entre costo con terreno', modo: 'max', lim: 0.5, tope: 0, u: '%' },
    { k: 'rv_meses_credito', nombre: 'Meses de crédito', largo: 'Meses de crédito, del arranque de obra al pago', modo: 'max', lim: 36, tope: 0, u: 'meses' },
    { k: 'rv_aportacion', nombre: 'Aportación', largo: 'Tierra más capital entre costo', modo: 'min', lim: 0.2, ideal: 0.25, tope: 0.5, u: '%' },
    { k: 'rv_margen', nombre: 'Margen s/ costo', largo: 'Margen antes de financiamiento sobre costo', modo: 'min', lim: 0.2, tope: 0.4, u: '%' },
    { k: 'rv_falta', nombre: 'Dinero que faltaría', largo: 'Dinero que faltaría (respaldo)', modo: 'cero', lim: 0, u: '$' },
    { k: 'rv_preventa', nombre: 'Preventa al arrancar', largo: 'Preventa firmada al arrancar la obra', modo: 'min', lim: 0.35, tope: 1, u: '%' },
    { k: 'rv_preventa_banco', nombre: 'Preventa al desembolso', largo: 'Preventa firmada antes del primer desembolso', modo: 'min', lim: 0.4, tope: 1, u: '%' },
    { k: 'rv_cobertura', nombre: 'Cobertura', largo: 'Por cobrar firmado entre saldo del banco, mínimo', modo: 'min', lim: 1.3, tope: 3, u: '×' }
  ];

  /* ───────────────────────── utilidades ───────────────────────── */
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function f1(x) { var s = (Math.round(x * 10) / 10).toFixed(1); return s.slice(-2) === '.0' ? s.slice(0, -2) : s; }
  function miles(s) { var p = String(s).split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.join('.'); }
  function mdp(x) { return num(x) === null ? '—' : (x < 0 ? '−' : '') + '$' + miles(Math.abs(x).toFixed(1)); }
  function mdp0(x) { return num(x) === null ? '—' : (x < 0 ? '−' : '') + '$' + miles(Math.abs(x).toFixed(0)); }
  function ent(x) { return num(x) === null ? '—' : miles(Math.round(x)); }
  function pct(x, d) { return num(x) === null ? '—' : (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function ancho(s, size, negrita) { return String(s).length * size * (negrita ? 0.57 : 0.52); }
  function corta(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function suma(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i] || 0; return t; }
  function fila(d, c) { return (d.flujo && d.flujo.filas && d.flujo.filas[c]) || []; }
  function total(d, c) { return d.flujo && d.flujo.total ? num(d.flujo.total[c]) : null; }
  function dato(d, c) { var x = d.datos && d.datos[c]; return x ? x.valor : null; }
  function primero(a) { for (var i = 0; i < a.length; i++) if (Math.abs(a[i]) > 0.0005) return i + 1; return 0; }
  function ultimo(a) { for (var i = a.length - 1; i >= 0; i--) if (Math.abs(a[i]) > 0.0005) return i + 1; return 0; }
  function fechaCorta(x) {
    var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], m;
    if (typeof x === 'number' && x > 20000) { var f = new Date(Math.round((x - 25569) * 86400000)); return f.getUTCDate() + '-' + MES[f.getUTCMonth()]; }
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(String(x || ''));
    return m ? Number(m[3]) + '-' + MES[Number(m[2]) - 1] + (m[4] ? ' ' + m[4] : '') : '';
  }
  /* Lo que sale al tocar una figura: título, renglones [nombre, valor] y de dónde sale. */
  function T(t, filas, origen) {
    return ' class="vz-t" data-t="' + esc(JSON.stringify({ t: t, f: filas || [], o: origen || '' })) + '"';
  }
  function spread(quiere, hueco, lo, hi) {
    var n = quiere.length, ys = quiere.slice(), i;
    for (i = 0; i < n; i++) ys[i] = Math.max(ys[i], i === 0 ? lo : ys[i - 1] + hueco);
    for (i = n - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i === n - 1 ? hi : ys[i + 1] - hueco);
    for (i = 0; i < n; i++) ys[i] = Math.max(ys[i], i === 0 ? lo : ys[i - 1] + hueco);
    return ys;
  }
  function poly(arriba, abajo, color, op) {
    var pts = arriba.concat(abajo.slice().reverse()).map(function (p) { return f1(p[0]) + ',' + f1(p[1]); }).join(' ');
    return '<polygon points="' + pts + '" fill="' + color + '" fill-opacity="' + (op == null ? 1 : op) + '"></polygon>';
  }
  function cuadrito(x, y, c, s) { s = s || 4.2; return '<rect x="' + f1(x) + '" y="' + f1(y - s + 0.4) + '" width="' + s + '" height="' + s + '" rx="1" fill="' + c + '"></rect>'; }
  function palomita(cx, cy, r, color) {
    return '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + r + '" fill="' + (color || CLI) + '"></circle>' +
      '<path d="M' + f1(cx - r * 0.45) + ' ' + f1(cy + r * 0.02) + ' l' + f1(r * 0.32) + ' ' + f1(r * 0.34) + ' l' + f1(r * 0.62) + ' ' + f1(-r * 0.68) +
      '" fill="none" stroke="#fffdf9" stroke-width="' + f1(Math.max(0.9, r * 0.24)) + '" stroke-linecap="round" stroke-linejoin="round"></path>';
  }
  /* De dónde sale cada cifra, con el nombre real de la pestaña del libro. «Versiones» son las claves
     `v{n}.…` de la pestaña Resumen; «Flujo» es la pestaña «Flujo V{n}» de la versión que se ve. */
  var VER = 0;
  function L(hoja, clave) {
    if (hoja === 'Versiones') return 'Libro · Resumen · ' + String(clave || '').replace(/[a-z][a-z0-9_]*[a-z0-9]/g, function (m) { return 'v' + VER + '.' + m; });
    if (hoja === 'Flujo') return 'Libro · Flujo V' + VER + (clave ? ' · ' + clave : '');
    if (hoja === 'Plan') return 'Libro · Resumen · ' + (clave || 'plan');
    return 'Libro · ' + hoja + (clave ? ' · ' + clave : '');
  }
  function sinDatos(w, texto) { return '<text x="' + (w / 2) + '" y="70" text-anchor="middle" font-size="8" fill="' + GRIS + '">' + texto + '</text>'; }
  function ventasPorProducto(d) { return (d.productos || []).map(function (p) { return [p.nombre, mdp(p.ventas)]; }); }

  /* ───────────────────────── 1 · Terreno ───────────────────────── */
  function claseTipo(tipo) {
    var t = String(tipo || '').toLowerCase().normalize ? String(tipo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : String(tipo || '').toLowerCase();
    if (/lote|fraccionamiento|urbaniz/.test(t)) return 'lotes';
    if (/casa|condomin|unifamiliar|horizontal/.test(t) && !/vertical|torre|edificio|depart/.test(t)) return 'casas';
    return 'vertical';
  }
  function cTerreno(d) {
    var v = d.v || {}, P = d.productos || [], o = [], clase = claseTipo(d.plan && d.plan.tipo);
    var terreno = num(dato(d, 'terreno.m2')), constr = num(dato(d, 'lamina.m2_construidos'));
    var vend = suma(P.map(function (p) { return p.m2; })) || num(dato(d, 'lamina.m2_vendibles'));
    var tierra = num(v.tierra), ventas = num(v.ventas);
    var tipTerreno = T('Terreno', [['Superficie', ent(terreno) + ' m²'], ['Estado del dato', (d.datos && d.datos['terreno.m2'] || {}).estado || '—']], L('Datos', 'terreno.m2'));
    if (clase === 'vertical') {
      var sot = /s[oó]tano/i.test((d.plan && d.plan.tipo) || '');
      o.push('<defs><pattern id="vzSot" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#ddd6c7"></rect><rect width="1.5" height="4" fill="#b9b1a1"></rect></pattern></defs>');
      o.push('<g' + tipTerreno + '><rect x="1" y="92" width="88" height="18" fill="#efe9dc"></rect>' + (sot ? '<rect x="5" y="92.8" width="80" height="14.2" fill="url(#vzSot)"></rect>' : '') + '</g>');
      var bloques = P.length ? P : [{ nombre: 'Construcción', m2: 1 }], n = bloques.length, Hb = 74.5, y = 92;
      var anchos = bloques.map(function (p, i) { return n >= 2 && i === 0 ? 74 : 44; });
      var crudo = bloques.map(function (p, i) { return (p.m2 || 0) / anchos[i]; }), k = Hb / (suma(crudo) || 1);
      var altos = crudo.map(function (c) { return Math.max(4, c * k); }), esc2 = Hb / suma(altos);
      bloques.forEach(function (p, i) {
        var h = altos[i] * esc2, w = anchos[i], x = 45 - w / 2;
        y -= h;
        o.push('<rect' + T(p.nombre, [['Área vendible', ent(p.m2) + ' m²'], ['Parte del vendible', vend ? pct(p.m2 / vend, 0) : '—']], L('Productos')) +
          ' x="' + f1(x) + '" y="' + f1(y + (i ? 0.5 : 0)) + '" width="' + w + '" height="' + f1(h - (i ? 0.5 : 0)) + '" fill="' + (P.length ? PRODUCTO[i % 6] : '#b9b1a1') + '"></rect>');
      });
      var tope = y;
      o.push('<rect x="27" y="' + f1(tope - 5) + '" width="36" height="4.5" fill="#d9cfbb"></rect>');
      o.push('<line x1="1" y1="92" x2="89" y2="92" stroke="' + INK + '" stroke-width="1.2"></line>' +
        '<line x1="1" y1="84" x2="1" y2="110" stroke="' + GRIS + '" stroke-width="0.8" stroke-dasharray="2 2"></line><line x1="89" y1="84" x2="89" y2="110" stroke="' + GRIS + '" stroke-width="0.8" stroke-dasharray="2 2"></line>');
      o.push('<path d="M96 ' + f1(tope - 5) + ' H98.5 V107 H96" fill="none" stroke="' + MUTED + '" stroke-width="0.9"></path><line x1="98.5" y1="13" x2="101" y2="13" stroke="' + MUTED + '" stroke-width="0.9"></line>' +
        '<path d="M91 ' + f1(tope) + ' H93.5 V92 H91" fill="none" stroke="' + ORO + '" stroke-width="1.1"></path><rect x="97.6" y="51.5" width="1.8" height="4" fill="#fffdf9"></rect><line x1="93.5" y1="53.5" x2="101" y2="53.5" stroke="' + ORO + '" stroke-width="1.1"></line>');
    } else if (clase === 'casas') {
      o.push('<g' + tipTerreno + '><rect x="0" y="96" width="90" height="14" fill="#ddd6c7"></rect><text x="4" y="106" font-size="7" fill="' + MUTED + '">calle</text><rect x="38" y="4" width="14" height="92" fill="#e6e0d2"></rect>');
      var casas = '', verdes = '';
      [5, 54].forEach(function (x) { for (var i = 0; i < 6; i++) { casas += '<rect x="' + x + '" y="' + (6 + 14 * i) + '" width="31" height="13"></rect>'; verdes += '<rect x="' + (x === 5 ? 21 : 55) + '" y="' + (8 + 14 * i) + '" width="14" height="9"></rect>'; } });
      o.push('<g fill="#fffdf9" stroke="#cfc6b3" stroke-width="0.7">' + casas + '</g><g fill="' + CLI + '">' + verdes + '</g><line x1="38" y1="93" x2="52" y2="93" stroke="' + TIE + '" stroke-width="1.6"></line>' +
        '<rect x="3" y="4" width="84" height="88" fill="none" stroke="' + GRIS + '" stroke-width="0.8" stroke-dasharray="2 2"></rect></g>');
      o.push('<line x1="101" y1="13" x2="70" y2="13" stroke="' + MUTED + '" stroke-width="0.9"></line><circle cx="69.5" cy="13" r="1.4" fill="' + MUTED + '"></circle><line x1="101" y1="53.5" x2="85.5" y2="53.5" stroke="' + ORO + '" stroke-width="1.1"></line><circle cx="85" cy="53.5" r="1.4" fill="' + ORO + '"></circle>');
    } else {
      o.push('<g' + tipTerreno + '><rect x="0" y="96" width="90" height="14" fill="#ddd6c7"></rect><text x="4" y="106" font-size="7" fill="' + MUTED + '">calle</text><rect x="40" y="4" width="10" height="92" fill="#e6e0d2"></rect><rect x="3" y="44" width="84" height="8" fill="#e6e0d2"></rect>' +
        '<g fill="#f1e8d6" stroke="#cfc6b3" stroke-width="0.7"><rect x="5" y="6" width="33" height="36"></rect><rect x="5" y="54" width="33" height="36"></rect><rect x="52" y="54" width="33" height="36"></rect></g>');
      var rayas = '';
      [[5, 6], [5, 54], [52, 54]].forEach(function (b) { for (var i = 1; i < 4; i++) rayas += '<line x1="' + (b[0] + 8.25 * i) + '" y1="' + b[1] + '" x2="' + (b[0] + 8.25 * i) + '" y2="' + (b[1] + 36) + '"></line>'; rayas += '<line x1="' + b[0] + '" y1="' + (b[1] + 18) + '" x2="' + (b[0] + 33) + '" y2="' + (b[1] + 18) + '"></line>'; });
      o.push('<g stroke="#cfc6b3" stroke-width="0.6">' + rayas + '</g><rect x="52" y="6" width="33" height="36" fill="#d6e5cf" stroke="#b7cfad" stroke-width="0.7"></rect>' +
        '<g fill="#8fb486"><circle cx="60" cy="15" r="3"></circle><circle cx="72" cy="13" r="3.4"></circle><circle cx="66" cy="27" r="3.2"></circle><circle cx="79" cy="28" r="2.8"></circle></g>' +
        '<rect x="3" y="4" width="84" height="88" fill="none" stroke="' + GRIS + '" stroke-width="0.8" stroke-dasharray="2 2"></rect></g>');
      o.push('<line x1="101" y1="13" x2="46" y2="13" stroke="' + MUTED + '" stroke-width="0.9"></line><circle cx="45.5" cy="13" r="1.4" fill="' + MUTED + '"></circle><line x1="101" y1="53.5" x2="85.5" y2="53.5" stroke="' + ORO + '" stroke-width="1.1"></line><circle cx="85" cy="53.5" r="1.4" fill="' + ORO + '"></circle>');
    }
    var parte = constr && vend ? ' · ' + pct(vend / constr, 1) : '';
    o.push('<g' + T('Construcción total', [['Construcción', constr ? ent(constr) + ' m²' : 'sin capturar'], ['Estado del dato', (d.datos && d.datos['lamina.m2_construidos'] || {}).estado || '—']], L('Datos', 'lamina.m2_construidos')) + '>' +
      '<text x="102" y="16" font-size="8" fill="' + MUTED + '">Construcción total</text><text x="102" y="28" font-size="11" font-weight="700" fill="' + (constr ? INK : '#a39b8b') + '">' + (constr ? ent(constr) : '—') + ' m²</text></g>');
    o.push('<g' + T('Área vendible', [['Vendible', ent(vend) + ' m²']].concat(constr && vend ? [['Vendible ÷ construcción', pct(vend / constr, 1)]] : []), L('Productos', 'suma de m² vendibles')) + '>' +
      '<text x="102" y="56" font-size="8" fill="' + ORO + '">Vendible' + parte + '</text><text x="102" y="68" font-size="11" font-weight="700" fill="' + (vend ? INK : '#a39b8b') + '">' + (vend ? ent(vend) : '—') + ' m²</text></g>');
    o.push('<g' + tipTerreno + '><text x="1" y="121" font-size="7" font-weight="700" letter-spacing="0.6" fill="' + MUTED + '">TERRENO</text><text x="1" y="133.5" font-size="11" font-weight="700" fill="' + INK + '">' + ent(terreno) + ' m²</text></g>');
    o.push('<g' + T('Tierra', [['Valor de la tierra', mdp(tierra)], ['Ventas', mdp(ventas)]].concat(tierra && ventas ? [['Tierra ÷ ventas', pct(tierra / ventas, 1)]] : []), L('Versiones', 'tierra y ventas')) + '>' +
      '<text x="70" y="121" font-size="7" font-weight="700" letter-spacing="0.6" fill="' + MUTED + '">TIERRA</text><text x="70" y="133.5" font-size="9.5" fill="' + INK + '"><tspan font-weight="700">' + (tierra === null ? '—' : f1(tierra)) + ' MDP</tspan>' +
      (tierra && ventas ? ' · ' + pct(tierra / ventas, 1) + '/ventas' : '') + '</text></g>');
    var sub = corta(String((d.plan && d.plan.tipo) || '').split(/[:(]/)[0].trim().toLowerCase(), 24);
    return {
      id: 'terreno', n: 1, titulo: 'Terreno', sub: esc(sub), svg: o.join(''), w: 184,
      aria: 'Terreno: ' + ent(terreno) + ' m², tierra ' + mdp(tierra) + ', construcción ' + ent(constr) + ' m², vendible ' + ent(vend) + ' m²',
      detalle: [{ h: 'Terreno y cabida', filas: [
        ['Superficie del terreno', ent(terreno) + ' m²', L('Datos', 'terreno.m2')],
        ['Valor de la tierra', mdp(tierra), L('Versiones', 'tierra')],
        ['Tierra entre ventas', tierra && ventas ? pct(tierra / ventas, 1) : '—', 'tierra ÷ ventas'],
        ['Construcción total', constr ? ent(constr) + ' m²' : '—', L('Datos', 'lamina.m2_construidos')],
        ['Área vendible', ent(vend) + ' m²', L('Productos')],
        ['Vendible entre construcción', constr && vend ? pct(vend / constr, 1) : '—', 'vendible ÷ construcción']
      ] }, { h: 'Tipo de proyecto', filas: [[(d.plan && d.plan.tipo) || '—', '', L('Plan', 'plan.tipo')]] }]
    };
  }

  /* ───────────────────────── 2 · Producto ───────────────────────── */
  function rejilla(bx, by, bw, bh, n) {
    var filas = Math.max(1, Math.round(Math.sqrt(n * bh / bw))), base = Math.floor(n / filas), extra = n % filas, rh = bh / filas, o = '', r, c;
    for (r = 1; r < filas; r++) o += '<line x1="' + f1(bx) + '" y1="' + f1(by + r * rh) + '" x2="' + f1(bx + bw) + '" y2="' + f1(by + r * rh) + '"></line>';
    for (r = 0; r < filas; r++) {
      var cnt = base + (r < extra ? 1 : 0), cw = bw / Math.max(1, cnt);
      for (c = 1; c < cnt; c++) o += '<line x1="' + f1(bx + c * cw) + '" y1="' + f1(by + r * rh) + '" x2="' + f1(bx + c * cw) + '" y2="' + f1(by + (r + 1) * rh) + '"></line>';
    }
    return o;
  }
  function reparte(pesos, largo, minimo, hueco) {
    var n = pesos.length, util = largo - hueco * (n - 1), t = suma(pesos) || 1, w = pesos.map(function (p) { return util * p / t; }), i, falta = 0, libres = 0;
    for (i = 0; i < n; i++) if (w[i] < minimo) { falta += minimo - w[i]; w[i] = minimo; } else libres += w[i] - minimo;
    if (falta > 0 && libres > 0) for (i = 0; i < n; i++) if (w[i] > minimo) w[i] -= falta * (w[i] - minimo) / libres;
    return w;
  }
  function cProducto(d) {
    var P = (d.productos || []).map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return (b.p.m2 || 0) - (a.p.m2 || 0); });
    var n = P.length, tot = suma(P.map(function (x) { return x.p.m2; })), ventas = num((d.v || {}).ventas), unidades = suma(P.map(function (x) { return x.p.unidades; }));
    var o = ['<defs><clipPath id="vzMos"><rect x="0" y="0" width="184" height="112" rx="6"></rect></clipPath></defs><g clip-path="url(#vzMos)">'], texto = [];
    var corte = n <= 2 ? n : Math.floor(n / 2), filas = n ? [P.slice(0, corte)].concat(n > corte ? [P.slice(corte)] : []) : [];
    var altos = reparte(filas.map(function (f) { return suma(f.map(function (x) { return x.p.m2; })); }), 112, 26, 2), y = 0;
    var halo = function (c) { return 'fill="#fffdf9" stroke="' + c + '" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"'; };
    filas.forEach(function (f, r) {
      var anchos = reparte(f.map(function (x) { return x.p.m2; }), 184, 30, 2), x = 0, h = altos[r];
      f.forEach(function (b, j) {
        var p = b.p, w = anchos[j], c = PRODUCTO[b.i % 6], parte = tot ? Math.round(p.m2 / tot * 100) + '%' : '';
        var tip = T(p.nombre, [['Ventas', mdp(p.ventas)], ['Unidades', ent(p.unidades)], ['Área vendible', ent(p.m2) + ' m² · ' + parte + ' del total'],
          ['Precio por m²', '$' + ent(p.precio_m2)], ['Precio por unidad', mdp(p.precio_unidad) + ' MDP']], L('Productos'));
        o.push('<g' + tip + '><rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="' + c + '"></rect>' +
          (p.unidades > 0 && p.unidades <= 400 ? '<g stroke="#fffdf9" stroke-opacity="0.32" stroke-width="0.7">' + rejilla(x, y, w, h, Math.round(p.unidades)) + '</g>' : '') + '</g>');
        var nom = corta(p.nombre, Math.max(4, Math.floor((w - 10) / 5.2))), u = ent(p.unidades) + ' u', m = ent(p.m2) + ' m²';
        if (w >= 72 && h >= 56) {
          texto.push('<text x="' + f1(x + 6) + '" y="' + f1(y + 14) + '" font-size="9.5" font-weight="700" ' + halo(c) + '>' + esc(nom) + '</text>' +
            '<text x="' + f1(x + 6) + '" y="' + f1(y + 35) + '" font-family="' + SERIF + '" font-size="19" ' + halo(c) + '>' + mdp(p.ventas) + '</text>' +
            '<text x="' + f1(x + 6) + '" y="' + f1(y + 48) + '" font-size="7.5" ' + halo(c) + '>' + u + '</text>' +
            '<text x="' + f1(x + 6) + '" y="' + f1(y + 58) + '" font-size="7.5" ' + halo(c) + '>' + m + ' · <tspan font-weight="700">' + parte + '</tspan></text>');
        } else if (w >= 100 && h >= 30) {
          texto.push('<text x="' + f1(x + 6) + '" y="' + f1(y + 13) + '" font-size="9.5" font-weight="700" ' + halo(c) + '>' + esc(nom) + '</text>' +
            '<text x="' + f1(x + w - 6) + '" y="' + f1(y + 15) + '" text-anchor="end" font-family="' + SERIF + '" font-size="16" ' + halo(c) + '>' + mdp(p.ventas) + '</text>' +
            '<text x="' + f1(x + 6) + '" y="' + f1(y + 27) + '" font-size="7.5" ' + halo(c) + '>' + u + ' · ' + m + ' · <tspan font-weight="700">' + parte + '</tspan></text>');
        } else if (w >= 40 && h >= 34) {
          texto.push('<text x="' + f1(x + 5) + '" y="' + f1(y + 11.5) + '" font-size="8.5" font-weight="700" ' + halo(c) + '>' + esc(nom) + '</text>' +
            '<text x="' + f1(x + 5) + '" y="' + f1(y + 23.5) + '" font-size="10.5" font-weight="700" ' + halo(c) + '>' + mdp(p.ventas) + '</text>' +
            '<text x="' + f1(x + 5) + '" y="' + f1(y + 33) + '" font-size="7" ' + halo(c) + '>' + u + ' · <tspan font-weight="700">' + parte + '</tspan></text>');
        } else {
          texto.push('<text x="' + f1(x + 4) + '" y="' + f1(y + 10) + '" font-size="7.5" font-weight="700" ' + halo(c) + '>' + esc(corta(p.nombre, Math.max(3, Math.floor((w - 8) / 4.4)))) + '</text>' +
            (h >= 22 ? '<text x="' + f1(x + 4) + '" y="' + f1(y + 20) + '" font-size="8" font-weight="700" ' + halo(c) + '>' + mdp(p.ventas) + '</text>' : ''));
        }
        x += w + 2;
      });
      y += h + 2;
    });
    o.push('</g><g pointer-events="none">' + texto.join('') + '</g>');
    o.push('<rect x="0.5" y="124.5" width="7" height="7" fill="' + GRIS + '"></rect><g stroke="#fffdf9" stroke-width="0.6"><line x1="4" y1="124.5" x2="4" y2="131.5"></line><line x1="0.5" y1="128" x2="7.5" y2="128"></line></g>' +
      '<text x="10" y="131" font-size="8" fill="' + MUTED + '">= 1 unidad · $ en millones (MDP)</text>');
    o.push('<text' + T('Ventas totales', ventasPorProducto(d).concat([['Total de ventas', mdp(ventas)], ['Unidades', ent(unidades)], ['Área vendible', ent(tot) + ' m²']]), L('Productos') + ' y Resumen · v' + d.version + '.ventas') + ' x="184" y="131.5" text-anchor="end" font-size="10.5" font-weight="700" fill="' + INK + '">' + mdp(ventas) + '</text>');
    return {
      id: 'producto', n: 2, titulo: 'Producto', sub: n ? ent(tot) + ' m² vendibles' : '', svg: n ? o.join('') : sinDatos(184, 'Aún no hay productos capturados'), w: 184,
      aria: 'Producto: ' + n + ' productos, ' + ent(unidades) + ' unidades, ventas ' + mdp(ventas),
      detalle: [{ h: 'Ventas por producto (MDP)', filas: (d.productos || []).map(function (p) {
        return [p.nombre, mdp(p.ventas), ent(p.unidades) + ' u · ' + ent(p.m2) + ' m² · $' + ent(p.precio_m2) + '/m² · ' + mdp(p.precio_unidad) + ' por unidad'];
      }).concat([['Total', mdp(ventas), ent(unidades) + ' u · ' + ent(tot) + ' m² · ' + L('Productos')]]) }]
    };
  }

  /* ───────────────────────── 3 · Tiempo ───────────────────────── */
  function regla(N) { var pm = 134 / Math.max(1, N); return { pm: pm, X: function (m) { return 48 + (m - 1) * pm; }, XE: function (m) { return 48 + m * pm; } }; }
  function marcasMes(d, N) {
    var v = d.v || {}, cand = [1, num(v.obra_inicio), num(v.fin_obra), N], out = [];
    cand.forEach(function (m) { if (m && m >= 1 && m <= N && out.indexOf(m) < 0) out.push(m); });
    return out.sort(function (a, b) { return a - b; });
  }
  function ejeMeses(d, N, yLinea, yTexto) {
    var R = regla(N), o = '<line x1="48" y1="' + yLinea + '" x2="182" y2="' + yLinea + '" stroke="#cfc6b3" stroke-width="0.8"></line>', ms = marcasMes(d, N), ult = -99;
    ms.forEach(function (m, i) {
      var fin = i === ms.length - 1 && m === N, x = fin ? 182 : R.X(m);
      if (x - ult < 9 && !fin) return;
      o += '<text x="' + f1(x) + '" y="' + yTexto + '" text-anchor="' + (fin ? 'end' : 'middle') + '" font-size="6.6" fill="' + GRIS + '">' + m + '</text>';
      ult = x;
    });
    return o;
  }
  function cTiempo(d) {
    var v = d.v || {}, N = Math.max(1, (d.flujo && d.flujo.meses) || num(v.mes_reparto) || 1), R = regla(N), o = [];
    var firmas = fila(d, 'firmas'), saldos = fila(d, 'saldos'), vi = primero(firmas), vf = ultimo(firmas), ei = primero(saldos), ef = ultimo(saldos);
    var oi = num(v.obra_inicio), of = num(v.fin_obra), rep = num(v.mes_reparto), prev = num(v.rv_preventa), pmin = num(dato(d, 'din.preventa_minima'));
    var unidades = total(d, 'firmas'), mesesVenta = vi && vf ? vf - vi + 1 : 0, corto = prev !== null && pmin !== null && prev < pmin;
    if (oi) {
      var tx = clamp(R.X(oi), 50, 134);
      o.push('<line x1="' + f1(R.X(oi)) + '" y1="12" x2="' + f1(R.X(oi)) + '" y2="78" stroke="' + TIE + '" stroke-width="0.9" stroke-dasharray="2 2"></line>' +
        '<text' + T('Arranque de obra', [['Mes de arranque', 'mes ' + oi], ['Preventa firmada al arrancar', pct(prev)], ['Mínimo para arrancar', pct(pmin, 0)]], L('Versiones', 'obra_inicio y rv_preventa')) +
        ' x="' + f1(tx) + '" y="8.5" text-anchor="middle" font-size="7.5" fill="' + ORO + '">arranca la obra · <tspan font-weight="700"' + (corto ? ' fill="' + BADT + '"' : '') + '>' + pct(prev) + ' vendido</tspan></text>');
    }
    var rows = [['Ventas', vi, vf, TIE, 'Meses con firmas', L('Flujo', 'unidades que se firman')], ['Obra', oi, of, CAP, 'Meses de obra', L('Versiones', 'obra_inicio y fin_obra')], ['Escrituras', ei, ef, CLI, 'Meses en que se cobran los saldos', L('Flujo', 'saldos al escriturar')]];
    rows.forEach(function (r, i) {
      var y = 16 + i * 16, a = r[1], b = r[2];
      o.push('<text x="0" y="' + (y + 7.5) + '" font-size="8.5" fill="' + BODY + '">' + r[0] + '</text>');
      if (!a || !b) return;
      var w = (b - a + 1) * R.pm, txt = (b - a + 1) + ' meses';
      o.push('<g' + T(r[0], [['Del mes', a], ['Al mes', b], ['Duración', txt]].concat(i === 0 && unidades ? [['Unidades que se firman', ent(unidades)]] : []), r[5]) + '><rect x="' + f1(R.X(a)) + '" y="' + y + '" width="' + f1(w) + '" height="10" rx="3" fill="' + r[3] + '"></rect>' +
        (w >= ancho(txt, 7.5, true) + 8 ? '<text x="' + f1(R.X(a) + 4) + '" y="' + (y + 7.6) + '" font-size="7.5" font-weight="600" fill="#fffdf9">' + txt + '</text>' : '') + '</g>');
    });
    if (rep) {
      var cx = clamp(R.XE(rep) - 3.5, 52, 180);
      o.push('<g' + T('Reparto', [['Mes del reparto', 'mes ' + rep], ['El dueño recibe lo último en el mes', num(v.dueno_meses) || '—']], L('Versiones', 'mes_reparto')) + '><text x="0" y="71.5" font-size="8.5" font-weight="700" fill="' + INK + '">Reparto</text>' +
        '<circle cx="' + f1(cx) + '" cy="69" r="3.5" fill="' + INK + '"></circle><text x="' + f1(cx - 6.5) + '" y="71.6" text-anchor="end" font-size="7.5" font-weight="700" fill="' + INK + '">mes ' + rep + '</text></g>');
    }
    o.push(ejeMeses(d, N, 81, 89));
    var kpis = [
      [rep ? String(rep) : '—', 'meses de plazo', 'firma a reparto', T('Plazo', [['Mes del reparto', rep || '—']], L('Versiones', 'mes_reparto'))],
      [pct(prev), 'preventa', pmin !== null ? 'mínimo ' + pct(pmin, 0) : '', T('Preventa al arrancar la obra', [['Preventa firmada', pct(prev)], ['Mínimo', pct(pmin, 0)]], L('Versiones', 'rv_preventa'))],
      [mesesVenta && unidades ? f1(unidades / mesesVenta) : '—', 'unidades al mes', mesesVenta ? pct(1 / mesesVenta) + ' del total' : '',
        T('Ritmo de venta', [['Unidades', ent(unidades)], ['Meses de venta', mesesVenta || '—'], ['Unidades ÷ meses', mesesVenta && unidades ? f1(unidades / mesesVenta) : '—']], L('Flujo', 'unidades que se firman'))]
    ];
    kpis.forEach(function (kp, i) {
      var x = i * 62;
      if (i) o.push('<line x1="' + (x - 4) + '" y1="98" x2="' + (x - 4) + '" y2="134" stroke="#e1dacb" stroke-width="0.8"></line>');
      o.push('<g' + kp[3] + '><text x="' + x + '" y="112" font-size="14" font-weight="700" fill="' + (i === 1 && corto ? BADT : INK) + '">' + kp[0] + '</text><text x="' + x + '" y="123" font-size="7.5" fill="' + BODY + '">' + kp[1] + '</text>' +
        (kp[2] ? '<text x="' + x + '" y="132" font-size="7" fill="' + GRIS + '">' + kp[2] + '</text>' : '') + '</g>');
    });
    return {
      id: 'tiempo', n: 3, titulo: 'Tiempo', sub: 'etapas y cifras', svg: d.flujo && d.flujo.meses ? o.join('') : sinDatos(184, 'Aún no hay calendario calculado'), w: 184,
      aria: 'Tiempo: ventas del mes ' + vi + ' al ' + vf + ', obra del ' + oi + ' al ' + of + ', reparto en el mes ' + rep,
      detalle: [{ h: 'Calendario (meses del plan)', filas: [
        ['Ventas', vi ? 'mes ' + vi + ' a ' + vf : '—', mesesVenta + ' meses · ' + L('Flujo', 'unidades que se firman')],
        ['Obra', oi ? 'mes ' + oi + ' a ' + of : '—', L('Versiones', 'obra_inicio y fin_obra')],
        ['Escrituras', ei ? 'mes ' + ei + ' a ' + ef : '—', L('Flujo', 'saldos al escriturar')],
        ['Banco liquidado', num(v.banco_mes) ? 'mes ' + v.banco_mes : '—', L('Versiones', 'banco_mes')],
        ['Capital liquidado', num(v.capital_mes) ? 'mes ' + v.capital_mes : '—', L('Versiones', 'capital_mes')],
        ['Reparto', rep ? 'mes ' + rep : '—', L('Versiones', 'mes_reparto')]
      ] }, { h: 'Ritmo', filas: [
        ['Preventa al arrancar la obra', pct(prev), 'mínimo ' + pct(pmin, 0) + ' · ' + L('Versiones', 'rv_preventa')],
        ['Unidades por mes', mesesVenta && unidades ? f1(unidades / mesesVenta) : '—', ent(unidades) + ' unidades ÷ ' + mesesVenta + ' meses']
      ] }]
    };
  }

  /* ───────────────────────── 4 · Costo y ganancia ───────────────────────── */
  function cCosto(d) {
    var v = d.v || {}, ventas = num(v.ventas) || 0, tierra = num(v.tierra) || 0, cierre = total(d, 'cierre') || 0, gan = num(v.ganancia);
    var rend = num(v.rend_capital) || 0, costoDin = num(v.costo_dinero) || 0, banco = Math.max(0, costoDin - rend), sinTierra = num(v.costo_sin_tierra) || 0;
    var items = [
      ['Terreno', tierra + cierre, '#9a7b3f', [['Valor de la tierra', mdp(tierra)], ['Cierre de tierra', mdp(cierre)]], L('Versiones', 'tierra') + ' y Flujo V' + d.version + ' · cierre de tierra'],
      ['Costos directos', total(d, 'obra') || 0, '#b06a5f', [['Obra directa', mdp(total(d, 'obra'))]], L('Flujo', 'obra directa')],
      ['Costos indirectos', total(d, 'indirectos') || 0, '#d39a6a', [['Indirectos', mdp(total(d, 'indirectos'))]], L('Flujo', 'indirectos')],
      ['Contingencias', total(d, 'imprevistos') || 0, '#e2c08d', [['Imprevistos', mdp(total(d, 'imprevistos'))]], L('Flujo', 'imprevistos')],
      ['Comisiones de venta', total(d, 'comisiones') || 0, '#8f7a9e', [['Comisiones', mdp(total(d, 'comisiones'))], ['Comisión sobre ventas', pct(num(dato(d, 'costo.comision')))]], L('Flujo', 'comisiones')],
      ['Intereses y apertura', banco, '#3e6484', [['Intereses del banco', mdp(total(d, 'interes'))], ['Comisión de apertura', mdp(total(d, 'apertura'))], ['Costo del dinero menos rendimiento del capital', mdp(banco)]], L('Versiones', 'costo_dinero − rend_capital')],
      ['Retorno del capital', rend, '#7d9cbc', [['Rendimiento pagado al capital', mdp(rend)], ['Tasa anual', pct(num(dato(d, 'din.tasa_capital')), 0)]], L('Versiones', 'rend_capital')]
    ].filter(function (it) { return it[1] > 0.05; });
    var pierde = gan !== null && gan < 0;
    if (!pierde) items.push(['Utilidad antes de ISR', gan || 0, CLI, [['Ganancia real, después de la tierra', mdp(gan)], ['Sobre ventas', pct(num(v.margen))]], L('Versiones', 'ganancia')]);
    var RX = 66, g = 3.6, top = 2, H = 112, suman = suma(items.map(function (it) { return it[1]; })) || 1;
    var sc = (H - g * (items.length - 1)) / suman, lh = suman * sc, yl = top + (H - lh) / 2, yr = top, o = [], centros = [];
    o.push('<rect' + T('Ingresos por ventas', ventasPorProducto(d).concat([['Total de ventas', mdp(ventas)]]), L('Productos') + ' y Resumen · v' + d.version + '.ventas') + ' x="0" y="' + f1(yl) + '" width="6" height="' + f1(lh) + '" rx="1.5" fill="' + INK + '"></rect>');
    items.forEach(function (it) {
      var h = it[1] * sc, xm = (6 + RX) / 2;
      var filasIt = it[3].concat(it[3].length > 1 ? [['Total', mdp(it[1])]] : []).concat([['De cada $100 de ventas', ventas ? '$' + f1(it[1] / ventas * 100) : '—']]);
      it[5] = filasIt;
      o.push('<g' + T(it[0], filasIt, it[4]) + '>' +
        '<path d="M6 ' + f1(yl) + ' C' + f1(xm) + ' ' + f1(yl) + ' ' + f1(xm) + ' ' + f1(yr) + ' ' + RX + ' ' + f1(yr) + ' L' + RX + ' ' + f1(yr + h) + ' C' + f1(xm) + ' ' + f1(yr + h) + ' ' + f1(xm) + ' ' + f1(yl + h) + ' 6 ' + f1(yl + h) + ' Z" fill="' + it[2] + '" fill-opacity="0.42"></path>' +
        '<rect x="' + RX + '" y="' + f1(yr) + '" width="6" height="' + f1(Math.max(h, 1.2)) + '" fill="' + it[2] + '"></rect></g>');
      centros.push([it, yr + h / 2]);
      yl += h; yr += h + g;
    });
    var ys = spread(centros.map(function (c) { return c[1] + 2.5; }), 9.6, 8, 113);
    centros.forEach(function (c, i) {
      var it = c[0], fin = it[0] === 'Utilidad antes de ISR', ly = ys[i];
      o.push('<polyline points="' + (RX + 7) + ',' + f1(c[1]) + ' ' + (RX + 9) + ',' + f1(ly - 2.5) + ' ' + (RX + 11) + ',' + f1(ly - 2.5) + '" fill="none" stroke="' + GRIS + '" stroke-width="0.6"></polyline>' +
        '<g' + T(it[0], it[5], it[4]) + '><text x="' + (RX + 13) + '" y="' + f1(ly) + '" font-size="7"' + (fin ? ' font-weight="700"' : '') + ' fill="' + (fin ? CLIT : BODY) + '">' + it[0] + '</text>' +
        '<text x="184" y="' + f1(ly) + '" text-anchor="end" font-size="7.8" font-weight="700" fill="' + (fin ? CLIT : INK) + '">' + mdp(it[1]) + '</text></g>');
    });
    var costoTotal = sinTierra + tierra, antes = ventas - costoTotal;
    o.push('<text' + T('Ventas y costo total', ventasPorProducto(d).concat([['Ingresos por ventas', mdp(ventas)], ['Costo sin tierra', mdp(sinTierra)], ['Tierra', mdp(tierra)], ['Costo total con tierra', mdp(costoTotal)]]), L('Versiones', 'ventas, costo_sin_tierra y tierra')) +
      ' x="0" y="124" font-size="7" fill="' + MUTED + '">Ingresos por ventas <tspan font-weight="700" fill="' + INK + '">' + mdp(ventas) + '</tspan> · costo total ' + mdp(costoTotal) + '</text>');
    o.push('<text' + T('Utilidad antes de intereses', [['Ventas menos costo total', mdp(antes)], ['Margen sobre costo', pct(num(v.rv_margen))], ['Costo del dinero', mdp(costoDin)], ['Ganancia real', mdp(gan)]], L('Versiones', 'rv_margen, costo_dinero y ganancia')) +
      ' x="0" y="133.5" font-size="7" fill="' + MUTED + '">' + (pierde ? 'Pérdida después del costo del dinero <tspan font-weight="700" fill="' + BADT + '">' + mdp(gan) + '</tspan>'
        : 'Utilidad antes de intereses <tspan font-weight="700" fill="' + ORO + '">' + mdp(antes) + '</tspan> · ' + pct(num(v.rv_margen)) + ' sobre costo') + '</text>');
    return {
      id: 'costo', n: 4, titulo: 'Costo y ganancia', sub: 'flujo', svg: ventas ? o.join('') : sinDatos(184, 'Aún no hay cifras calculadas'), w: 184,
      aria: 'Costo y ganancia: ventas ' + mdp(ventas) + ', costo total ' + mdp(costoTotal) + ', utilidad antes de ISR ' + mdp(gan),
      detalle: [{ h: 'De las ventas a la utilidad (MDP)', filas: [['Ingresos por ventas', mdp(ventas), L('Versiones', 'ventas')]].concat(items.map(function (it) {
        return ['− ' + it[0], mdp(it[1]), it[4]];
      })).concat(pierde ? [['Pérdida', mdp(gan), L('Versiones', 'ganancia')]] : []) }, { h: 'Cortes', filas: [
        ['Costo total con tierra', mdp(costoTotal), 'costo sin tierra + tierra'],
        ['Utilidad antes de intereses', mdp(antes), 'ventas − costo total'],
        ['Margen antes de financiamiento sobre costo', pct(num(v.rv_margen)), L('Versiones', 'rv_margen')],
        ['Costo del dinero', mdp(costoDin), L('Versiones', 'costo_dinero')],
        ['Ganancia real sobre ventas', pct(num(v.margen)), L('Versiones', 'margen')]
      ] }]
    };
  }

  /* ───────────────────────── 5 · Dinero ───────────────────────── */
  function trimestres(d, N) {
    var q = [], n = Math.ceil(N / 3), s = function (c, i) { var a = fila(d, c); return (a[3 * i] || 0) + (a[3 * i + 1] || 0) + (a[3 * i + 2] || 0); };
    for (var i = 0; i < n; i++) q.push({
      de: 3 * i + 1, a: Math.min(N, 3 * i + 3), cli: s('cobranza', i), ban: s('disposicion', i), cap: s('cap_aporta', i), res: s('respaldo', i),
      obra: s('egresos', i), costob: s('interes', i) + s('apertura', i), pagob: s('pago_banco', i), pagoc: s('pago_capital', i), pagor: s('pago_respaldo', i)
    });
    return q;
  }
  function cDinero(d) {
    var v = d.v || {}, N = Math.max(1, (d.flujo && d.flujo.meses) || 1), R = regla(N), Q = trimestres(d, N), o = [];
    var F = fila(d, 'flujo_acum'), capAc = fila(d, 'cap_acum'), salB = fila(d, 'saldo_banco');
    var hayBanco = (total(d, 'disposicion') || 0) > 0.05, hayCap = (total(d, 'cap_aporta') || 0) > 0.05, hayRes = suma(fila(d, 'respaldo')) > 0.05;
    var alBanco = (total(d, 'pago_banco') || 0) + (total(d, 'interes') || 0) + (total(d, 'apertura') || 0);
    /* columnas: entra arriba, sale abajo */
    var AX = 24, maxQ = 1;
    Q.forEach(function (t) { maxQ = Math.max(maxQ, t.cli + t.ban + t.cap + t.res, t.obra + t.costob + t.pagob + t.pagoc + t.pagor); });
    var sc = 17 / maxQ, w = Math.max(1.5, 3 * R.pm - 1.9);
    Q.forEach(function (t) {
      var x = R.X(t.de) + 0.95, y = AX - 0.4, cols = '';
      [['cli', CLI, 1], ['ban', BAN, 1], ['cap', CAP, 1], ['res', RES, 1]].forEach(function (k) {
        var h = t[k[0]] * sc; if (h > 0.05) { cols += '<rect x="' + f1(x) + '" y="' + f1(y - h) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="' + k[1] + '"></rect>'; y -= h; }
      });
      y = AX + 0.4;
      [['obra', OBR, 1], ['costob', BAN, 0.45], ['pagob', BAN, 1], ['pagoc', CAP, 1], ['pagor', RES, 1]].forEach(function (k) {
        var h = t[k[0]] * sc; if (h > 0.05) { cols += '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="' + k[1] + '" fill-opacity="' + k[2] + '"></rect>'; y += h; }
      });
      var f = [['Entra de clientes', mdp(t.cli)]];
      if (t.ban > 0.05) f.push(['Entra del banco', mdp(t.ban)]);
      if (t.cap > 0.05) f.push(['Entra de capital', mdp(t.cap)]);
      if (t.res > 0.05) f.push(['Entra de respaldo', mdp(t.res)]);
      f.push(['Sale a costos', mdp(t.obra)]);
      if (t.costob + t.pagob > 0.05) f.push(['Sale al banco', mdp(t.costob + t.pagob)]);
      if (t.pagoc > 0.05) f.push(['Sale al capital', mdp(t.pagoc)]);
      if (t.pagor > 0.05) f.push(['Sale al respaldo', mdp(t.pagor)]);
      o.push('<g' + T('Meses ' + t.de + ' a ' + t.a, f, L('Flujo', 'suma de tres meses')) + '><rect x="' + f1(x - 0.9) + '" y="5" width="' + f1(w + 1.8) + '" height="38" fill="#fffdf9" fill-opacity="0"></rect>' + cols + '</g>');
    });
    o.push('<line x1="48" y1="' + AX + '" x2="182" y2="' + AX + '" stroke="' + INK + '" stroke-width="0.7"></line>');
    /* el valle: saldo acumulado, con el hoyo pintado por quién lo tapa */
    var maxF = Math.max.apply(null, [0].concat(F)), minF = Math.min.apply(null, [0].concat(F)), yT = 47, yB = 104;
    var es = (yB - yT) / Math.max(1, maxF - minF), Z = yT + maxF * es, Y = function (x) { return Z - x * es; };
    var V = [[48, 0, 0, 0]], i;
    for (i = 0; i < N; i++) {
      var ant = V[V.length - 1], act = [R.XE(i + 1), F[i] || 0, capAc[i] || 0, salB[i] || 0];
      if (ant[1] * act[1] < 0) { var t0 = ant[1] / (ant[1] - act[1]); V.push([ant[0] + t0 * (act[0] - ant[0]), 0, ant[2] + t0 * (act[2] - ant[2]), ant[3] + t0 * (act[3] - ant[3])]); }
      V.push(act);
    }
    var cero = V.map(function (p) { return [p[0], Y(0)]; });
    var capB = V.map(function (p) { return [p[0], Y(-Math.min(Math.max(-p[1], 0), hayCap ? p[2] : 0))]; });
    var banB = V.map(function (p) {
      var falta = Math.max(-p[1], 0), c = hayCap ? Math.min(falta, p[2]) : 0, resto = falta - c;
      return [p[0], Y(-(c + (hayBanco ? (hayRes ? Math.min(resto, p[3]) : resto) : 0)))];
    });
    var fondo = V.map(function (p) { return [p[0], Y(Math.min(p[1], 0))]; });
    o.push(poly(V.map(function (p) { return [p[0], Y(Math.max(p[1], 0))]; }), cero, CLI, 0.3));
    if (hayCap) o.push(poly(cero, capB, CAP, 0.92));
    if (hayBanco) o.push(poly(capB, banB, BAN, 0.9));
    if (hayRes || (!hayBanco && !hayCap)) o.push(poly(banB, fondo, hayRes ? RES : BAD, hayRes ? 0.9 : 0.35));
    o.push('<line x1="48" y1="' + f1(Z) + '" x2="182" y2="' + f1(Z) + '" stroke="#b9b1a1" stroke-width="0.7"></line>');
    o.push('<polyline points="' + V.map(function (p) { return f1(p[0]) + ',' + f1(Y(p[1])); }).join(' ') + '" fill="none" stroke="' + INK + '" stroke-width="1.1" stroke-linejoin="round"></polyline>');
    var salR = fila(d, 'saldo_respaldo'), cajaM = fila(d, 'caja'), franjas = '';
    for (i = 0; i < N; i++) {
      var fm = [['Saldo acumulado', ((F[i] || 0) > 0 ? '+' : '') + mdp(F[i] || 0)]];
      if (hayCap) fm.push(['Capital aportado', mdp(capAc[i] || 0)]);
      if (hayBanco) fm.push(['Saldo del banco', mdp(salB[i] || 0)]);
      if (hayRes) fm.push(['Saldo del respaldo', mdp(salR[i] || 0)]);
      if (cajaM.length) fm.push(['Caja del proyecto', mdp(cajaM[i] || 0)]);
      franjas += '<rect' + T('Mes ' + (i + 1), fm, L('Flujo', 'columna del mes ' + (i + 1))) + ' x="' + f1(R.X(i + 1)) + '" y="' + (yT - 3) + '" width="' + f1(R.pm) + '" height="' + (yB - yT + 11) + '" fill="#fffdf9" fill-opacity="0"></rect>';
    }
    o.push(franjas);
    var mv = 0, mh = 0;
    for (i = 0; i < N; i++) if ((F[i] || 0) < (F[mv] || 0)) mv = i;
    for (i = 0; i < mv; i++) if ((F[i] || 0) > (F[mh] || 0)) mh = i;
    var hoyo = F[mv] || 0, junta = mv > 0 ? (F[mh] || 0) : 0, fin = F[N - 1] || 0, ajeno = num(v.max_ajeno), cajaMin = total(d, 'caja_minima');
    var punto = function (m, val, c, tip) { return '<circle' + tip + ' cx="' + f1(R.XE(m)) + '" cy="' + f1(Y(val)) + '" r="1.9" fill="' + c + '" stroke="#fffdf9" stroke-width="0.8"></circle>'; };
    if (junta > 0.05) {
      var tj = T('Lo que junta la preventa', [['Saldo acumulado', '+' + mdp(junta)], ['Mes', mh + 1]], L('Flujo', 'flujo acumulado'));
      o.push(punto(mh + 1, junta, CLI, tj) + '<text' + tj + ' x="' + f1(clamp(R.XE(mh + 1), 62, 150)) + '" y="' + f1(Y(junta) - 4.2) + '" text-anchor="middle" font-size="6.6" font-weight="700" fill="' + CLIT + '">+' + mdp(junta) + '</text>');
    }
    if (hoyo < -0.05) {
      var th = T('Lo más hondo', [['Saldo acumulado', mdp(hoyo)], ['Mes', mv + 1], ['Dinero ajeno en uso, máximo', mdp(ajeno)]], L('Flujo', 'flujo acumulado'));
      o.push(punto(mv + 1, hoyo, BAD, th) + '<text' + th + ' x="' + f1(clamp(R.XE(mv + 1) - 8, 76, 150)) + '" y="' + f1(Math.min(Y(hoyo) + 8.6, 113)) + '" text-anchor="middle" font-size="6.6" font-weight="700" fill="' + BADT + '">' + mdp(hoyo) +
        ' <tspan font-weight="400" fill="' + MUTED + '" font-size="5.6">· mes ' + (mv + 1) + '</tspan></text>');
    }
    var tf = T('Resultado a repartir', [['Antes de pagar capital y tierra', mdp(num(v.resultado_repartir))], ['Mes', N]], L('Versiones', 'resultado_repartir'));
    o.push(punto(N, fin, fin >= 0 ? CLI : BAD, tf) + '<text' + tf + ' x="174" y="' + f1(clamp(Y(fin) + 7.4, 50, 110)) + '" text-anchor="end" font-size="6.6" fill="' + MUTED + '">a repartir <tspan font-weight="700" fill="' + (fin >= 0 ? CLIT : BADT) + '">' + (fin >= 0 ? '+' : '') + mdp(fin) + '</tspan></text>');
    /* leyenda con los totales: entra y sale */
    var tasaB = num(dato(d, 'din.tiie')) !== null && num(dato(d, 'din.sobretasa')) !== null ? dato(d, 'din.tiie') + dato(d, 'din.sobretasa') : null;
    var entra = [[CLI, 'clientes', total(d, 'cobranza'), INK, L('Flujo', 'cobranza total'), [
      ['Enganches al firmar', mdp(total(d, 'enganches')), L('Flujo', 'enganches al firmar')], ['Pagos durante la obra', mdp(total(d, 'pagos_obra')), L('Flujo', 'pagos durante la obra')],
      ['Saldos al escriturar', mdp(total(d, 'saldos')), L('Flujo', 'saldos al escriturar')]]]];
    var sale = [[OBR, 'costos', total(d, 'egresos'), INK, L('Flujo', 'egresos totales'), [
      ['Obra directa', mdp(total(d, 'obra')), L('Flujo', 'obra directa')], ['Indirectos', mdp(total(d, 'indirectos')), L('Flujo', 'indirectos')], ['Imprevistos', mdp(total(d, 'imprevistos')), L('Flujo', 'imprevistos')],
      ['Comisiones de venta', mdp(total(d, 'comisiones')), L('Flujo', 'comisiones')], ['Cierre de tierra', mdp(total(d, 'cierre')), L('Flujo', 'cierre de tierra')]]]];
    if (hayBanco) {
      entra.push([BAN, 'banco', total(d, 'disposicion'), INK, L('Flujo', 'banco: disposición'), [['Crédito dispuesto', mdp(total(d, 'disposicion')), L('Flujo', 'banco: disposición')]]]);
      sale.push([BAN, 'al banco', alBanco, INK, L('Flujo', 'banco: pago, interés y apertura'), [['Pago del crédito', mdp(total(d, 'pago_banco')), L('Flujo', 'banco: pago')],
        ['Intereses', mdp(total(d, 'interes')), (tasaB !== null ? 'tasa ' + pct(tasaB) + ' · ' : '') + L('Flujo', 'banco: interés')],
        ['Comisión de apertura', mdp(total(d, 'apertura')), (num(dato(d, 'din.apertura')) !== null ? pct(dato(d, 'din.apertura')) + ' · ' : '') + L('Flujo', 'banco: comisión de apertura')]]]);
    }
    if (hayCap) {
      entra.push([CAP, 'capital', total(d, 'cap_aporta'), CAPT, L('Flujo', 'capital: aportación'), [['Capital aportado', mdp(total(d, 'cap_aporta')), L('Flujo', 'capital: aportación')]]]);
      sale.push([CAP, 'al capital', total(d, 'pago_capital'), CAPT, L('Flujo', 'capital: pago con su rendimiento'), [['Capital devuelto', mdp(num(v.capital)), L('Versiones', 'capital')],
        ['Rendimiento pagado', mdp(num(v.rend_capital)), (num(dato(d, 'din.tasa_capital')) !== null ? pct(dato(d, 'din.tasa_capital'), 0) + ' anual · ' : '') + L('Versiones', 'rend_capital')]]]);
    }
    if (hayRes) {
      entra.push([RES, 'respaldo', suma(fila(d, 'respaldo')), REST, L('Flujo', 'respaldo: lo que faltaría'), [['Dinero que faltaría', mdp(suma(fila(d, 'respaldo'))), L('Flujo', 'respaldo: lo que faltaría')]]]);
      sale.push([RES, 'al respaldo', total(d, 'pago_respaldo'), REST, L('Flujo', 'respaldo: pago'), [['Pago al respaldo', mdp(total(d, 'pago_respaldo')), L('Flujo', 'respaldo: pago')]]]);
    }
    var Mayus = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
    var paso = entra.length + sale.length > 6 ? 12.6 : 15, yy = 6.4;
    var item = function (it, y) {
      return '<g' + T(Mayus(it[1]), it[5].map(function (f) { return [f[0], f[1]]; }).concat(it[5].length > 1 ? [['Total', mdp(it[2])]] : []), it[4]) + '>' + cuadrito(0, y, it[0]) + '<text x="6.4" y="' + f1(y) + '" font-size="5.8" fill="' + BODY + '">' + it[1] + '</text>' +
        '<text x="6.4" y="' + f1(y + 6.6) + '" font-size="6.4" font-weight="700" fill="' + it[3] + '">' + mdp(it[2]) + '</text></g>';
    };
    o.push('<text x="0" y="' + yy + '" font-size="5.2" font-weight="700" letter-spacing="0.5" fill="' + ORO + '">ENTRA</text>');
    entra.forEach(function (it, j) { o.push(item(it, yy + 8 + j * paso)); });
    yy += 8 + entra.length * paso + 1;
    o.push('<text x="0" y="' + f1(yy) + '" font-size="5.2" font-weight="700" letter-spacing="0.5" fill="' + ORO + '">SALE</text>');
    sale.forEach(function (it, j) { o.push(item(it, yy + 8 + j * paso)); });
    o.push('<text x="45" y="' + (AX - 2.6) + '" text-anchor="end" font-size="5.2" fill="' + MUTED + '">entra</text><text x="45" y="' + (AX + 6.6) + '" text-anchor="end" font-size="5.2" fill="' + MUTED + '">sale</text>' +
      '<text x="45" y="' + f1(Z - 2) + '" text-anchor="end" font-size="5.2" fill="' + MUTED + '">saldo</text>');
    o.push(ejeMeses(d, N, 116, 123.4));
    o.push('<text' + T('Dinero ajeno y caja', [['Máximo de dinero ajeno en uso', mdp(ajeno)], ['Caja mínima exigida', mdp(cajaMin)], ['Costo del dinero', mdp(num(v.costo_dinero))]], L('Versiones', 'max_ajeno') + ' y Flujo V' + d.version + ' · caja mínima') +
      ' x="0" y="133" font-size="6.3" fill="' + BODY + '">Dinero ajeno máx. <tspan font-weight="700" fill="' + INK + '">' + mdp(ajeno) + '</tspan>' + (cajaMin ? ' · caja mínima ' + mdp(cajaMin) : '') + '</text>');
    var desglose = function (lista) {
      var out = [];
      lista.forEach(function (it) { out.push([Mayus(it[1]), mdp(it[2]), it[4]]); if (it[5].length > 1) it[5].forEach(function (f) { out.push(['· ' + f[0].toLowerCase(), f[1], f[2]]); }); });
      return out;
    };
    return {
      id: 'dinero', n: 5, titulo: 'Dinero', sub: 'entra, sale y saldo', svg: d.flujo && d.flujo.meses ? o.join('') : sinDatos(184, 'Aún no hay flujo calculado'), w: 184,
      aria: 'Dinero: lo más hondo ' + mdp(hoyo) + ' en el mes ' + (mv + 1) + ', dinero ajeno máximo ' + mdp(ajeno) + ', a repartir ' + mdp(fin),
      detalle: [{ h: 'Entra (MDP)', filas: desglose(entra) }, { h: 'Sale (MDP)', filas: desglose(sale) }, { h: 'Saldo y dinero ajeno', filas: [
        ['Lo que junta la preventa', junta > 0.05 ? '+' + mdp(junta) : '—', 'mes ' + (mh + 1) + ' · ' + L('Flujo', 'flujo acumulado')],
        ['Lo más hondo', mdp(hoyo), 'mes ' + (mv + 1) + ' · ' + L('Flujo', 'flujo acumulado')],
        ['Resultado a repartir', mdp(num(v.resultado_repartir)), L('Versiones', 'resultado_repartir')],
        ['Dinero ajeno en uso, máximo', mdp(ajeno), L('Versiones', 'max_ajeno')],
        ['Crédito del banco, saldo máximo', mdp(num(v.banco_max)), L('Versiones', 'banco_max')],
        ['Capital aportado', mdp(num(v.capital)), L('Versiones', 'capital')],
        ['Caja mínima exigida', mdp(cajaMin), L('Flujo', 'caja mínima')],
        ['Caja al cierre', mdp(num(v.caja_cierre)), L('Versiones', 'caja_cierre')],
        ['Costo del dinero', mdp(num(v.costo_dinero)), L('Versiones', 'costo_dinero')]
      ] }]
    };
  }

  /* ───────────────────────── 6 · Reparto (cuadro doble) ───────────────────────── */
  function cReparto(d) {
    var v = d.v || {}, rp = d.reparto || {}, o = [], X0 = 96;
    var pone = num(v.dueno_aporta) || 0, recibe = num(v.dueno_recibe) || 0, capital = num(v.capital) || 0, capRecibe = total(d, 'pago_capital') || (capital + (num(v.rend_capital) || 0));
    var alianza = num(v.alianza_recibe) || 0, sc = Math.min(1.7, 186 / Math.max(1, pone, recibe, capital, capRecibe, alianza));
    var rows = [['Dueño', 'pone su terreno', TIE, ORO, pone, 'pone ' + mdp(pone), recibe, 'recibe ' + mdp(recibe), num(v.dueno_veces) ? '×' + v.dueno_veces.toFixed(2) : '',
      T('Dueño del terreno', [['Aporta su tierra', mdp(pone)], ['Recibe en total', mdp(recibe)], ['Veces el valor de su tierra', num(v.dueno_veces) ? v.dueno_veces.toFixed(2) + '×' : '—'], ['Recibe lo último en el mes', num(v.dueno_meses) || '—']], L('Versiones', 'dueno_aporta, dueno_recibe y dueno_veces'))]];
    if (capital > 0.05) rows.push(['Capital', 'pone efectivo', CAP, CAPT, capital, 'pone ' + mdp(capital), capRecibe, 'recibe ' + mdp(capRecibe), '×' + (capRecibe / capital).toFixed(2),
      T('Capital', [['Aporta', mdp(capital)], ['Recibe con su rendimiento', mdp(capRecibe)], ['Rendimiento', mdp(num(v.rend_capital))], ['Tasa anual', pct(num(rp.tasa_capital), 0)], ['Liquidado en el mes', num(v.capital_mes) || '—']], L('Versiones', 'capital y rend_capital') + ' y Flujo V' + d.version + ' · capital: pago')]);
    rows.push(['Alianza', 'pone trabajo y gestión', CLI, CLIT, 0, 'sin dinero propio', alianza, 'recibe ' + mdp(alianza) + ' de utilidad', '',
      T('Alianza desarrolladora', [['Recibe', mdp(alianza)], ['Su parte de la utilidad', pct(num(rp.parte_alianza), 0)]], L('Versiones', 'alianza_recibe'))]);
    var paso = rows.length === 3 ? 39 : 52;
    rows.forEach(function (r, i) {
      var y = 4 + i * paso;
      o.push('<g' + r[9] + '><text x="0" y="' + (y + 13) + '" font-size="9" font-weight="700" fill="' + r[3] + '">' + r[0] + '</text><text x="0" y="' + (y + 23) + '" font-size="6.6" fill="' + BODY + '">' + r[1] + '</text>');
      if (r[4] > 0.05) o.push('<rect x="' + X0 + '" y="' + (y + 4) + '" width="' + f1(r[4] * sc) + '" height="9" rx="2" fill="' + r[2] + '" fill-opacity="0.32"></rect><text x="' + f1(X0 + r[4] * sc + 5) + '" y="' + (y + 11) + '" font-size="6.8" fill="' + BODY + '">' + r[5] + '</text>');
      else o.push('<rect x="' + X0 + '" y="' + (y + 4) + '" width="16" height="9" rx="2" fill="none" stroke="' + r[2] + '" stroke-width="0.8" stroke-dasharray="2 1.5"></rect><text x="' + (X0 + 21) + '" y="' + (y + 11) + '" font-size="6.8" fill="' + BODY + '">' + r[5] + '</text>');
      o.push('<rect x="' + X0 + '" y="' + (y + 17) + '" width="' + f1(Math.max(0, r[6]) * sc) + '" height="12" fill="' + r[2] + '"></rect><text x="' + f1(X0 + Math.max(0, r[6]) * sc + 5) + '" y="' + (y + 26.5) + '" font-size="7.6" font-weight="700" fill="' + INK + '">' + r[7] + '</text>');
      if (r[8]) o.push('<text x="396" y="' + (y + 26) + '" text-anchor="end" font-size="19" font-weight="700" fill="' + r[3] + '">' + r[8] + '</text>');
      o.push('</g>');
    });
    o.push('<text x="396" y="10" text-anchor="end" font-size="6.6" fill="' + MUTED + '">veces lo que puso</text>');
    var orden = [];
    if ((total(d, 'disposicion') || 0) > 0.05) orden.push('banco');
    if (capital > 0.05) orden.push('capital');
    if (rp.paga_tierra) orden.push('terreno');
    var pd = num(rp.parte_dueno), pa = num(rp.parte_alianza), pc = num(rp.parte_capital) || 0;
    orden.push(pd !== null ? (pd === pa && !pc ? 'utilidad mitad y mitad' : 'utilidad ' + pct(pd, 0) + ' dueño · ' + pct(pa, 0) + ' alianza' + (pc ? ' · ' + pct(pc, 0) + ' capital' : '')) : 'utilidad');
    o.push('<text' + T('Esquema de reparto', [['Esquema', rp.esquema || (d.plan && d.plan.esquema) || '—'], ['Parte del dueño', pct(pd, 0)], ['Parte de la alianza', pct(pa, 0)], ['Parte del capital', pct(pc, 0)], ['¿Se paga la tierra antes de repartir?', rp.paga_tierra ? 'sí' : 'no']], L('Reparto')) +
      ' x="0" y="131" font-size="6.8" fill="' + MUTED + '">Orden de cobro: ' + orden.join(' → ') + (num(v.dueno_meses) ? ' · el dueño cobra en el mes ' + v.dueno_meses : '') + '</text>');
    /* El mismo cuadro, en alto, para el pop-up del teléfono: cada quien en su renglón, con las barras a todo lo ancho. */
    var g = ['<text x="220" y="7" text-anchor="end" font-size="6" fill="' + MUTED + '">veces lo que puso</text>'], tope = Math.max(1, pone, recibe, capital, capRecibe, alianza), sg = 150 / tope;
    rows.forEach(function (r, i) {
      var y = 12 + i * 46;
      g.push('<g' + r[9] + '><rect x="0" y="' + y + '" width="220" height="42" fill="#fffdf9" fill-opacity="0"></rect>' +
        '<text x="0" y="' + (y + 10) + '" font-size="10" font-weight="700" fill="' + r[3] + '">' + r[0] + '<tspan font-size="6.6" font-weight="400" fill="' + BODY + '"> · ' + r[1] + '</tspan></text>');
      if (r[4] > 0.05) g.push('<rect x="0" y="' + (y + 16) + '" width="' + f1(r[4] * sg) + '" height="8" rx="2" fill="' + r[2] + '" fill-opacity="0.32"></rect><text x="' + f1(r[4] * sg + 4) + '" y="' + (y + 22.4) + '" font-size="6.8" fill="' + BODY + '">' + r[5] + '</text>');
      else g.push('<rect x="0" y="' + (y + 16) + '" width="14" height="8" rx="2" fill="none" stroke="' + r[2] + '" stroke-width="0.8" stroke-dasharray="2 1.5"></rect><text x="18" y="' + (y + 22.4) + '" font-size="6.8" fill="' + BODY + '">' + r[5] + '</text>');
      g.push('<rect x="0" y="' + (y + 27) + '" width="' + f1(Math.max(0, r[6]) * sg) + '" height="11" fill="' + r[2] + '"></rect><text x="' + f1(Math.max(0, r[6]) * sg + 4) + '" y="' + (y + 35.6) + '" font-size="7.6" font-weight="700" fill="' + INK + '">' + r[7].replace(' de utilidad', '') + '</text>');
      if (r[8]) g.push('<text x="220" y="' + (y + 12) + '" text-anchor="end" font-size="14" font-weight="700" fill="' + r[3] + '">' + r[8] + '</text>');
      g.push('</g>');
    });
    var yo = 12 + rows.length * 46 + 6;
    g.push('<text x="0" y="' + yo + '" font-size="6.6" fill="' + MUTED + '">Orden de cobro: ' + orden.join(' → ') + '</text>' +
      (num(v.dueno_meses) ? '<text x="0" y="' + (yo + 9.5) + '" font-size="6.6" fill="' + MUTED + '">El dueño cobra en el mes ' + v.dueno_meses + '</text>' : ''));
    return {
      id: 'reparto', n: 6, titulo: 'Reparto', sub: esc(corta(rp.esquema || (d.plan && d.plan.esquema) || 'pones y recibes', 44)), svg: pone || recibe || alianza ? o.join('') : sinDatos(396, 'Aún no hay reparto calculado'), w: 396, doble: true,
      svgG: pone || recibe || alianza ? g.join('') : sinDatos(220, 'Aún no hay reparto calculado'), wG: 220, hG: pone || recibe || alianza ? yo + 13 : 136,
      aria: 'Reparto: el dueño pone ' + mdp(pone) + ' y recibe ' + mdp(recibe) + '; la alianza recibe ' + mdp(alianza),
      detalle: [{ h: 'Quién pone y quién recibe (MDP)', filas: [
        ['Dueño · aporta su tierra', mdp(pone), L('Versiones', 'dueno_aporta')], ['Dueño · recibe en total', mdp(recibe), L('Versiones', 'dueno_recibe')],
        ['Dueño · veces su tierra', num(v.dueno_veces) ? v.dueno_veces.toFixed(2) + '×' : '—', L('Versiones', 'dueno_veces')],
        ['Capital · aporta', mdp(capital), L('Versiones', 'capital')], ['Capital · recibe con rendimiento', mdp(capRecibe), L('Flujo', 'capital: pago')],
        ['Alianza · recibe', mdp(alianza), L('Versiones', 'alianza_recibe')], ['Resultado a repartir', mdp(num(v.resultado_repartir)), L('Versiones', 'resultado_repartir')]
      ] }, { h: 'Esquema', filas: [
        [rp.esquema || (d.plan && d.plan.esquema) || '—', '', L('Reparto', 'esquema elegido')],
        ['Utilidad para el dueño', pct(pd, 0), L('Reparto')], ['Utilidad para la alianza', pct(pa, 0), L('Reparto')],
        ['Tasa anual del capital antes de repartir', pct(num(rp.tasa_capital), 0), L('Reparto')], ['Mes del reparto', num(v.mes_reparto) || '—', L('Versiones', 'mes_reparto')]
      ] }]
    };
  }

  /* ───────────────────────── 7 · Riesgo y estado ───────────────────────── */
  var A0 = 0.3125, A1 = 0.375, PUNTA = 0.0625;
  function arco(cx, cy, r, a, b) {
    var p = function (f) { return [cx + r * Math.sin(2 * Math.PI * f), cy - r * Math.cos(2 * Math.PI * f)]; }, A = p(a), B = p(b);
    return 'M' + f1(A[0]) + ' ' + f1(A[1]) + ' A' + r + ' ' + r + ' 0 ' + (b - a > 0.5 ? 1 : 0) + ' 1 ' + f1(B[0]) + ' ' + f1(B[1]);
  }
  function estadoPrueba(p, x) {
    if (x === null) return 'na';
    if (p.modo === 'cero') return x < 0.01 ? 'ok' : 'fuera';
    if (p.modo === 'max') return x <= p.lim ? 'ok' : 'fuera';
    if (x < p.lim) return 'fuera';
    return p.ideal && x < p.ideal ? 'justa' : 'ok';
  }
  function valorPrueba(p, x) {
    if (x === null) return '—';
    if (p.u === '%') return (x * 100).toFixed(1);
    if (p.u === '×') return x.toFixed(2) + '×';
    if (p.u === '$') return mdp0(x) === '$0' ? '$0' : mdp(x);
    return String(Math.round(x));
  }
  function limitePrueba(p) {
    if (p.modo === 'cero') return 'debe ser $0';
    var x = p.u === '%' ? Math.round(p.lim * 100) + '%' : (p.u === '×' ? p.lim + '×' : String(p.lim));
    return (p.modo === 'max' ? 'máx ' : 'mín ') + x + (p.ideal ? ' · lo sano es ' + Math.round(p.ideal * 100) + '%' : '');
  }
  function holguraPrueba(p, x, st) {
    if (st === 'na') return ['no aplica', MUTED];
    if (p.modo === 'cero') return st === 'ok' ? ['no falta', CLIT] : ['falta ' + mdp(x), BADT];
    if (st === 'justa') return ['justa · el banco pide ' + Math.round(p.ideal * 100) + '%', AMBT];
    var dif = Math.abs(p.modo === 'max' ? p.lim - x : x - p.lim), t = p.u === '%' ? (dif * 100).toFixed(1) + ' pts' : (p.u === '×' ? dif.toFixed(2) + '×' : Math.round(dif) + ' meses');
    return st === 'ok' ? ['sobran ' + t, CLIT] : ['faltan ' + t, BADT];
  }
  function anillo(p, x, cx, cy, r) {
    var st = estadoPrueba(p, x), sw = 2.4, o = '', ZOK = '#d5e5d1', ZAMB = '#f0d9a8', ZBAD = '#eccbc3', ZNEU = '#e9e3d6';
    var color = { ok: CLI, justa: AMB, fuera: BAD, na: GRIS }[st], tinta = { ok: INK, justa: AMBT, fuera: BADT, na: GRIS }[st];
    var pt = function (f) { return [cx + r * Math.sin(2 * Math.PI * f), cy - r * Math.cos(2 * Math.PI * f)]; };
    if (p.modo === 'cero' || st === 'na') {
      o += '<path d="' + arco(cx, cy, r, -A1, A1) + '" fill="none" stroke="' + (st === 'fuera' ? ZBAD : (st === 'na' ? ZNEU : ZOK)) + '" stroke-width="' + sw + '" stroke-linecap="round"></path>';
    } else {
      var lo = p.modo === 'max' ? p.tope : p.lim, hi = p.modo === 'max' ? p.lim : p.tope, enLo = p.modo === 'min';
      var pos = function (val) {
        if (val < lo) return -A0 - (enLo ? Math.min(PUNTA * 0.8, PUNTA * (lo - val) / (0.15 * (hi - lo))) : 0);
        if (val > hi) return A0 + (!enLo ? Math.min(PUNTA * 0.8, PUNTA * (val - hi) / (0.15 * (hi - lo))) : 0);
        return -A0 + 2 * A0 * (val - lo) / (hi - lo);
      };
      o += '<path d="' + arco(cx, cy, r, -A1, -A0) + '" fill="none" stroke="' + (enLo ? ZBAD : ZNEU) + '" stroke-width="' + sw + '" stroke-linecap="round"></path>' +
        '<path d="' + arco(cx, cy, r, A0, A1) + '" fill="none" stroke="' + (enLo ? ZNEU : ZBAD) + '" stroke-width="' + sw + '" stroke-linecap="round"></path>' +
        '<path d="' + arco(cx, cy, r, -A0, A0) + '" fill="none" stroke="' + (st === 'fuera' ? ZBAD : ZOK) + '" stroke-width="' + sw + '"></path>';
      if (p.ideal) o += '<path d="' + arco(cx, cy, r, pos(p.lim), pos(p.ideal)) + '" fill="none" stroke="' + ZAMB + '" stroke-width="' + sw + '"></path>';
      var fl = enLo ? -A0 : A0, a = [cx + (r - sw * 0.9) * Math.sin(2 * Math.PI * fl), cy - (r - sw * 0.9) * Math.cos(2 * Math.PI * fl)], b = [cx + (r + sw * 0.9) * Math.sin(2 * Math.PI * fl), cy - (r + sw * 0.9) * Math.cos(2 * Math.PI * fl)];
      o += '<line x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(b[0]) + '" y2="' + f1(b[1]) + '" stroke="' + INK + '" stroke-width="0.7"></line>';
      var q = pt(pos(x)), izq = pt(-A0), der = pt(A0), fmt = function (val) { return p.u === '%' ? Math.round(val * 100) + '%' : (p.u === '×' ? val + '×' : String(val)); };
      o += '<circle cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="2.3" fill="' + color + '" stroke="#fffdf9" stroke-width="0.8"></circle>';
      o += '<text x="' + f1(izq[0] - 3.3) + '" y="' + f1(izq[1] + 1.8) + '" text-anchor="end" font-size="5" fill="' + (enLo ? BADT : MUTED) + '"' + (enLo ? ' font-weight="700"' : '') + '>' + fmt(lo) + '</text>' +
        '<text x="' + f1(der[0] + 3.3) + '" y="' + f1(der[1] + 1.8) + '" font-size="5" fill="' + (enLo ? MUTED : BADT) + '"' + (enLo ? '' : ' font-weight="700"') + '>' + fmt(hi) + '</text>';
    }
    var txt = valorPrueba(p, x), size = 7.2;
    while (size > 5.6 && ancho(txt, size, true) > 2 * (r - sw / 2) - 2) size = Math.round((size - 0.2) * 10) / 10;
    o += '<text x="' + f1(cx) + '" y="' + f1(cy + size * 0.36) + '" text-anchor="middle" font-size="' + size + '" font-weight="700" fill="' + tinta + '">' + txt + '</text>';
    return { svg: o, st: st };
  }
  function cRiesgo(d) {
    var v = d.v || {}, o = [], COL = [0, 62, 124], FIL = [0, 36.5, 73], cuenta = { ok: 0, justa: 0, fuera: 0, na: 0 }, det = [];
    PRUEBAS.forEach(function (p, i) {
      var x = num(v[p.k]), cx = COL[i % 3] + 30, y0 = FIL[Math.floor(i / 3)], a = anillo(p, x, cx, y0 + 12, 10.4), h = holguraPrueba(p, x, a.st);
      cuenta[a.st]++;
      var valor = x === null ? (typeof v[p.k] === 'string' && v[p.k] ? v[p.k] : '—') : (p.u === '%' ? pct(x) : valorPrueba(p, x) + (p.u === 'meses' ? ' meses' : ''));
      var linea = p.modo === 'cero' && a.st === 'ok' ? '<tspan fill="' + MUTED + '">debe ser $0 · </tspan><tspan fill="' + h[1] + '" font-weight="700">' + h[0] + '</tspan>' : '<tspan fill="' + h[1] + '" font-weight="700">' + h[0] + '</tspan>';
      o.push('<g' + T(p.largo, [['El plan', valor], ['El banco pide', limitePrueba(p)], ['Holgura', h[0]]], L('Versiones', p.k)) + '><rect x="' + COL[i % 3] + '" y="' + y0 + '" width="60" height="35" fill="#fffdf9" fill-opacity="0"></rect>' + a.svg +
        '<text x="' + cx + '" y="' + f1(y0 + 28.2) + '" text-anchor="middle" font-size="5.4" fill="' + BODY + '">' + p.nombre + '</text><text x="' + cx + '" y="' + f1(y0 + 34.4) + '" text-anchor="middle" font-size="5.1">' + linea + '</text></g>');
      det.push([p.largo, valor, limitePrueba(p) + ' · ' + h[0] + ' · ' + L('Versiones', p.k)]);
    });
    var pr = d.pruebas || [], golpes = pr.filter(function (x) { return !/^base\b|sin cambio/i.test(x.escenario || ''); });
    var aguanta = golpes.filter(function (x) { return (x.respaldo || 0) < 0.01 && (x.ganancia || 0) > 0; }).length;
    var edad = String((d.plan && d.plan.edad) || ''), ie = EDADES.indexOf(edad), cand = num(d.plan && d.plan.candados_abiertos), abiertos = (d.candados || []).filter(function (c) { return /abierto|revisi/.test(c.estado); });
    o.push('<line x1="0" y1="110.6" x2="184" y2="110.6" stroke="#f0ebe0" stroke-width="0.7"></line>');
    o.push('<text' + T('Pruebas de estrés', golpes.length ? golpes.slice(0, 12).map(function (x) { return [x.escenario, (x.respaldo || 0) > 0.01 ? 'falta ' + mdp(x.respaldo) : 'gana ' + mdp(x.ganancia)]; }) : [['Sin pruebas de esta versión', 'hay que correrlas']], L('Pruebas')) +
      ' x="0" y="117.6" font-size="5.6" fill="' + BODY + '"><tspan font-weight="700" fill="' + ORO + '">Aguante</tspan> ' + (golpes.length ? 'aguanta <tspan font-weight="700" fill="' + INK + '">' + aguanta + ' de ' + golpes.length + '</tspan> golpes de las pruebas de estrés'
        : 'pruebas de estrés por repetir' + (d.pruebas_viejas ? ': el plan cambió' : '')) + '</text>');
    o.push('<text' + T('Estado del plan', [['Etapa', edad || '—'], ['Candados abiertos', cand === null ? '—' : cand]].concat(abiertos.slice(0, 8).map(function (c) { return ['· ' + c.candado, c.estado]; })), L('Plan', 'plan.edad') + ' y Candados') +
      ' x="0" y="126.2" font-size="5.8" fill="' + INK + '">Etapa <tspan font-weight="700" fill="' + CLIT + '">' + esc(edad || '—') + '</tspan>' + (ie >= 0 ? ' (' + (ie + 1) + ' de 5)' : '') +
      (cand !== null ? ' · <tspan font-weight="700" fill="' + (cand > 0 ? BADT : CLIT) + '">' + (cand > 0 ? cand + (cand === 1 ? ' candado abierto' : ' candados abiertos') : 'sin candados abiertos') + '</tspan>' : '') + '</text>');
    var paso = (d.plan && d.plan.paso_texto) || '';
    if (paso) o.push('<text' + T('Siguiente paso', [[paso, '']], L('Plan', 'plan.paso_texto')) + ' x="0" y="134.4" font-size="5.6" fill="' + MUTED + '">Siguiente paso: ' + esc(corta(paso, 50)) + '</text>');
    var res = String(v.rv_resultado || ''), pasa = /^pasa/i.test(res), nf = (/(\d+)\s+de\s+(\d+)/.exec(res) || [])[1];
    var sub = !res ? '' : (pasa ? '<b style="color:' + CLIT + '">Pasa</b>' + (cuenta.justa ? ' · ' + cuenta.justa + ' justa' + (cuenta.justa > 1 ? 's' : '') : '')
      : (/^no pasa/i.test(res) ? '<b style="color:' + BADT + '">No pasa</b>' + (nf ? ' · ' + nf + ' de 9' : '') : esc(corta(res, 24))));
    return {
      id: 'riesgo', n: 7, titulo: 'Riesgo y estado', sub: sub, svg: o.join(''), w: 184,
      aria: 'Riesgo y estado: revisión para fondos, ' + res + '; etapa ' + edad + '; ' + (cand === null ? '' : cand + ' candados abiertos'),
      detalle: [{ h: 'Revisión para fondos · ' + (res || 'sin calcular'), filas: det }, {
        h: 'Pruebas de estrés' + (golpes.length ? '' : ' · por repetir'),
        filas: golpes.length ? golpes.map(function (x) { return [x.escenario, (x.respaldo || 0) > 0.01 ? 'falta ' + mdp(x.respaldo) : 'gana ' + mdp(x.ganancia), (x.cambia || '') + (x.fecha ? ' · ' + fechaCorta(x.fecha) : '')]; })
          : [['No hay pruebas con las cifras de hoy', '', d.pruebas_viejas ? 'Las ' + d.pruebas_viejas + ' que hay son de cifras anteriores' : L('Pruebas')]]
      }, { h: 'Estado del plan', filas: [['Etapa', edad || '—', ie >= 0 ? (ie + 1) + ' de 5 · ' + L('Plan', 'plan.edad') : L('Plan', 'plan.edad')], ['Siguiente paso', '', paso || '—']].concat((d.candados || []).map(function (c) { return ['Candado · ' + c.candado, c.estado, L('Candados')]; })) }]
    };
  }

  /* ───────────────────────── la pantalla ───────────────────────── */
  function cuadros(d) { VER = d.version || 0; return [cReparto(d), cTerreno(d), cProducto(d), cTiempo(d), cCosto(d), cDinero(d), cRiesgo(d)]; }
  function svgDe(c, grande) {
    if (grande) return '<svg viewBox="0 0 ' + (c.wG || c.w) + ' ' + (c.hG || 136) + '" class="vz-svg-g" role="img" aria-label="' + esc(c.aria) + '">' + (c.svgG || c.svg) + '</svg>';
    return '<svg viewBox="0 0 ' + c.w + ' 136" width="' + c.w + '" height="136" role="img" aria-label="' + esc(c.aria) + '">' + c.svg + '</svg>';
  }
  function tarjeta(c) {
    return '<section class="vz-card' + (c.doble ? ' vz-doble' : '') + '" data-card="' + c.id + '" tabindex="0" role="button" aria-label="' + esc(c.n + ' · ' + c.titulo + ': ver el detalle') + '">' +
      '<div class="vz-head"><span class="vz-tit">' + c.n + ' · ' + esc(c.titulo) + '</span><span class="vz-sub">' + c.sub + '</span></div>' + svgDe(c, false) + '</section>';
  }
  function encabezado(d) {
    var v = d.v || {}, est = String(v.estado || ''), fa = fechaCorta(v.fecha_aprobacion), cambio = fechaCorta(d.cambio);
    return '<header class="vz-top"><div class="vz-l1"><span class="vz-marca">YoDesarrollo · Plan de Potencial</span>' +
      '<span class="vz-vivo" id="vzVivo"><i></i><span>En vivo' + (cambio ? ' · cambió ' + esc(cambio) : '') + '</span></span></div>' +
      '<div class="vz-l2"><h1>' + esc((d.plan && d.plan.nombre) || 'Plan de Potencial') + '</h1><span class="vz-ver">V' + d.version + (est ? ' ' + esc(est) : '') + (est === 'vigente' && fa ? ' · ' + fa : '') + '</span></div></header>';
  }
  function selector(d) {
    var planes = (d.menu && d.menu.planes) || [], vers = d.versiones || [], o = '';
    if (planes.length > 1) o += '<div class="vz-chips" role="group" aria-label="Terrenos">' + planes.map(function (p) {
      return '<button type="button" class="vz-chip' + (p.id === d.menu.plan ? ' vz-on' : '') + '" data-plan="' + esc(p.id) + '">' + esc(corta(p.etiqueta, 22)) + '</button>';
    }).join('') + '</div>';
    if (vers.length > 1) o += '<div class="vz-chips" role="group" aria-label="Versiones">' + vers.map(function (x) {
      return '<button type="button" class="vz-chip' + (x.n === d.version ? ' vz-on' : '') + '" data-v="' + x.n + '" title="' + esc(x.nombre) + '">V' + x.n + ' · ' + esc(corta(x.nombre || x.estado, 20)) + (x.estado === 'vigente' ? ' ✓' : '') + '</button>';
    }).join('') + '</div>';
    return o;
  }
  function pieMarcas(marcas) {
    if (!marcas || !marcas.length) return '';
    return '<div class="vz-marcas">' + marcas.map(function (m) {
      return m.img && /^data:image\//.test(m.img) ? '<img src="' + esc(m.img) + '" alt="' + esc(m.nombre) + '">' : '<span>' + esc(m.nombre) + '</span>';
    }).join('') + '</div>';
  }
  function pinta(d, marcas) {
    var cs = cuadros(d);
    return {
      cuadros: cs,
      html: encabezado(d) + selector(d) + (d.a_medias ? '<p class="vz-aviso">El plan está recalculando esta versión: las cifras pueden moverse.</p>' : '') +
        '<main class="vz-grid">' + cs.map(tarjeta).join('') + '</main>' + pieMarcas(marcas) +
        '<footer class="vz-pie"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>Confidencial · quien tenga esta liga ve el plan. No la reenvíes.</footer>'
    };
  }
  function detalleHtml(c) {
    return '<div class="vz-m-head"><div><span class="vz-tit">' + c.n + ' · ' + esc(c.titulo) + '</span><span class="vz-sub">' + c.sub + '</span></div>' +
      '<button type="button" class="vz-x" aria-label="Cerrar">×</button></div><div class="vz-m-fig">' + svgDe(c, true) + '</div>' +
      '<p class="vz-m-pista">Toca una cifra o una figura para ver de dónde sale.</p>' +
      c.detalle.map(function (s) {
        return '<h3>' + esc(s.h) + '</h3><dl>' + s.filas.map(function (f) {
          return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>' + (f[2] ? '<small>' + esc(f[2]) + '</small>' : '') + '</div>';
        }).join('') + '</dl>';
      }).join('');
  }

  var api = { pinta: pinta, cuadros: cuadros, detalleHtml: detalleHtml, PRUEBAS: PRUEBAS, estadoPrueba: estadoPrueba, ENDPOINT: ENDPOINT };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.VisorPPP = api;
  if (!root.document || root.VISOR_SIN_ARRANQUE) return;

  /* ───────────────────────── en la página ───────────────────────── */
  var doc = root.document, caja, modal, hoja, burbuja;
  var estado = { liga: '', plan: '', v: 0, llave: '', datos: null, marcas: null, cuadros: [], abierto: '', firmas: {}, fallas: 0, reloj: 0, turno: 0, quieto: 0, enVuelo: false };
  function $(id) { return doc.getElementById(id); }
  function ligaDeLaDireccion() {
    var m = /[#&?]l=([A-Za-z0-9_-]{24,80})(?:&|$)/.exec(root.location.hash || '') || /[?&]l=([A-Za-z0-9_-]{24,80})(?:&|$)/.exec(root.location.search || '');
    return m ? m[1] : '';
  }
  function equipo() {
    var u = root.navigator.userAgent || '';
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'otro';
  }
  function pide(extra) {
    var q = '?recurso=ppp2-visor&liga=' + encodeURIComponent(estado.liga) + (estado.plan ? '&plan=' + encodeURIComponent(estado.plan) : '') + (estado.v ? '&v=' + estado.v : '') + (extra || '');
    var ctl = root.AbortController ? new root.AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
    return root.fetch(ENDPOINT + q, { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
  }
  function mensaje(titulo, texto) {
    caja.innerHTML = '<div class="vz-msg"><h1>' + esc(titulo) + '</h1><p>' + esc(texto) + '</p></div>';
    ajusta();
  }
  /* La pantalla mide 440 de ancho: se escala al ancho del teléfono y, si por poco no cabe a lo alto, se
     encoge hasta 10 % más para que quepa sin deslizar. En una pantalla grande se centra y cabe a lo alto. */
  function ajusta() {
    var W = doc.documentElement.clientWidth || root.innerWidth, H = root.innerHeight, alto = Math.max(1, caja.offsetHeight), s = W / 440;
    if (W > 700) s = Math.max(0.6, Math.min(1.7, s, (H - 12) / alto));
    else if (alto * s > H) s = Math.max(H / alto, 0.9 * s);
    caja.style.transform = 'scale(' + s + ')';
    caja.parentNode.style.width = (440 * s) + 'px';
    caja.parentNode.style.height = (alto * s) + 'px';
    caja.parentNode.style.marginTop = W > 700 ? Math.max(0, (H - alto * s) / 2) + 'px' : '0';
  }
  function vivo(clase, texto) {
    var el = $('vzVivo');
    if (!el) return;
    el.className = 'vz-vivo' + (clase ? ' ' + clase : '');
    if (texto) el.lastChild.textContent = texto;
  }
  function seApago() {
    estado.liga = ''; clearTimeout(estado.reloj); cierra();
    mensaje('Esta liga ya no está activa', 'Pide una nueva a quien te la compartió.');
  }
  function muestra(d, primera) {
    var p = pinta(d, estado.marcas), antes = estado.firmas, ahora = {};
    estado.datos = d; estado.cuadros = p.cuadros; estado.llave = d.llave || '';
    caja.innerHTML = p.html;
    p.cuadros.forEach(function (c) { ahora[c.id] = c.svg; });
    if (!primera) Array.prototype.forEach.call(caja.querySelectorAll('.vz-card'), function (el) {
      var id = el.getAttribute('data-card');
      if (antes[id] && antes[id] !== ahora[id]) el.classList.add('vz-cambio');
    });
    estado.firmas = ahora;
    doc.title = ((d.plan && d.plan.nombre) || 'Plan de Potencial') + ' · en vivo';
    ajusta();
    if (estado.abierto) abre(estado.abierto, true);
  }
  function carga(primera) {
    var turno = ++estado.turno;
    return pide(primera ? '&abre=1&eq=' + equipo() : '').then(function (j) {
      if (turno !== estado.turno) return;
      if (!j || !j.ok) {
        if (j && (j.error === 'liga' || j.error === 'plan')) seApago();
        else if (primera) mensaje('No pude abrir el plan', 'Vuelve a intentar en un momento.');
        else vivo('vz-off', 'No pude abrirlo · reintentando');
        return;
      }
      if (j.marcas) estado.marcas = j.marcas;
      estado.fallas = 0;
      muestra(j, primera);
    });
  }
  /* «¿Cambió el libro?»: una pregunta ligera; el servidor sólo vuelve a mandar el plan si su libro cambió. */
  function late() {
    if (!estado.liga || doc.hidden || !estado.llave || estado.enVuelo) return;
    var turno = estado.turno;
    estado.enVuelo = true;
    pide('&si=' + encodeURIComponent(estado.llave)).then(function (j) {
      estado.enVuelo = false;
      if (turno !== estado.turno) return;
      if (j && j.ok && j.igual) { estado.fallas = 0; estado.quieto++; if ($('vzVivo') && /vz-off/.test($('vzVivo').className)) vivo('', 'En vivo'); return; }
      if (j && j.ok) { estado.fallas = 0; estado.quieto = 0; muestra(j, false); vivo('vz-nuevo', 'Actualizado · ' + fechaCorta(j.cambio || j.leido)); return; }
      if (j && (j.error === 'liga' || j.error === 'plan')) seApago();
    }).catch(function () { estado.enVuelo = false; if (++estado.fallas >= 2) vivo('vz-off', 'Sin conexión · reintentando'); });
  }
  /* Con la página a la vista pregunta cada CADA_MS; si lleva diez minutos sin cambios ni toques, cada 15 s. */
  function programa() {
    clearTimeout(estado.reloj);
    if (!estado.liga) return;
    estado.reloj = setTimeout(function () { late(); programa(); }, estado.quieto > 600000 / CADA_MS ? 15000 : CADA_MS);
  }

  /* pop-up de un cuadro: dentro de la misma página; atrás, la × o tocar fuera lo cierran */
  function abre(id, repinta) {
    var c = estado.cuadros.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var top = repinta ? hoja.scrollTop : 0;
    hoja.innerHTML = detalleHtml(c);
    hoja.setAttribute('aria-label', c.titulo);
    quitaBurbuja();
    if (repinta) { hoja.scrollTop = top; return; }
    estado.abierto = id;
    modal.hidden = false;
    hoja.scrollTop = 0;
    doc.documentElement.classList.add('vz-con-modal');
    try { root.history.pushState({ vz: id }, ''); } catch (e) { }
  }
  function cierra(desdeHistoria) {
    if (!estado.abierto) return;
    estado.abierto = '';
    modal.hidden = true;
    doc.documentElement.classList.remove('vz-con-modal');
    quitaBurbuja();
    if (!desdeHistoria) { try { if (root.history.state && root.history.state.vz) root.history.back(); } catch (e) { } }
  }
  function quitaBurbuja() {
    if (!burbuja) return;
    burbuja.hidden = true;
    var sel = doc.querySelector('.vz-sel');
    if (sel) sel.classList.remove('vz-sel');
  }
  function ponBurbuja(el, x, y) {
    var t;
    try { t = JSON.parse(el.getAttribute('data-t')); } catch (e) { return; }
    quitaBurbuja();
    el.classList.add('vz-sel');
    burbuja.innerHTML = '<b>' + esc(t.t) + '</b>' + (t.f || []).map(function (f) { return '<div><span>' + esc(f[0]) + '</span><span>' + esc(f[1]) + '</span></div>'; }).join('') + (t.o ? '<small>' + esc(t.o) + '</small>' : '');
    burbuja.hidden = false;
    var w = burbuja.offsetWidth, h = burbuja.offsetHeight, W = doc.documentElement.clientWidth || root.innerWidth, H = root.innerHeight;
    burbuja.style.left = clamp(x - w / 2, 8, Math.max(8, W - w - 8)) + 'px';
    burbuja.style.top = (y - h - 14 > 8 ? y - h - 14 : Math.min(Math.max(8, H - h - 8), y + 18)) + 'px';
  }
  function arranca() {
    caja = $('vz'); modal = $('vzModal'); hoja = modal.firstElementChild; burbuja = $('vzTip');
    estado.liga = ligaDeLaDireccion();
    root.addEventListener('resize', ajusta);
    if (!estado.liga) { mensaje('Falta la liga', 'Abre el visor desde la liga completa que te compartieron.'); return; }
    mensaje('Abriendo el plan…', 'Leyendo el libro.');
    carga(true).catch(function () { mensaje('No pude abrir el plan', 'Revisa tu conexión y vuelve a intentar.'); });
    programa();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(ajusta);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) { estado.quieto = 0; late(); programa(); } });
    doc.addEventListener('pointerdown', function () { estado.quieto = 0; }, true);
    caja.addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.vz-chip') : null, card = e.target.closest ? e.target.closest('.vz-card') : null;
      if (chip) {
        if (chip.getAttribute('data-plan')) { estado.plan = chip.getAttribute('data-plan'); estado.v = 0; } else estado.v = Number(chip.getAttribute('data-v')) || 0;
        Array.prototype.forEach.call(chip.parentNode.children, function (c) { c.classList.toggle('vz-on', c === chip); });
        estado.llave = ''; estado.firmas = {}; vivo('vz-nuevo', 'Abriendo…');
        carga(false).catch(function () { vivo('vz-off', 'Sin conexión · reintentando'); });
      } else if (card) abre(card.getAttribute('data-card'));
    });
    caja.addEventListener('keydown', function (e) {
      var card = e.target.closest ? e.target.closest('.vz-card') : null;
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abre(card.getAttribute('data-card')); }
    });
    modal.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('.vz-t') : null;
      if (e.target === modal || (e.target.closest && e.target.closest('.vz-x'))) { cierra(); return; }
      if (t) ponBurbuja(t, e.clientX, e.clientY); else quitaBurbuja();
    });
    /* con ratón, la leyenda sale al pasar por encima (también en la pantalla principal) */
    doc.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var t = e.target.closest ? e.target.closest('.vz-t') : null;
      if (t) ponBurbuja(t, e.clientX, e.clientY); else if (!burbuja.hidden) quitaBurbuja();
    });
    hoja.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      var el = doc.elementFromPoint(e.clientX, e.clientY), t = el && el.closest ? el.closest('.vz-m-fig .vz-t') : null;
      if (t) ponBurbuja(t, e.clientX, e.clientY);
    });
    hoja.addEventListener('scroll', quitaBurbuja);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') cierra(); });
    root.addEventListener('popstate', function () { cierra(true); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
