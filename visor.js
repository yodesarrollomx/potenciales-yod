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
  var CADA_MS = Number(root.PPP2_VISOR_MS) || 3000;   // cada cuánto se pregunta «¿cambió el libro?» (sólo con la página a la vista)

  /* ───────────────────────── colores y medidas ───────────────────────── */
  var INK = '#231d14', MUTED = '#6e675a', BODY = '#4a4336', ORO = '#7d5f1e', GRIS = '#8a8272';
  var CLI = '#39744b', CLIT = '#2b5b39', BAN = '#3b352c', CAP = '#3e6484', CAPT = '#2c4a63', OBR = '#b06a5f', OBRT = '#8a4a40';
  var RES = '#8f7a9e', REST = '#5f4f6e', TIE = '#8a6d33', BAD = '#a94438', BADT = '#7f2f26', AMB = '#c98a2b', AMBT = '#8a5a12';
  var PRODUCTO = ['#8a6d33', '#3e6484', '#3f7a78', '#39744b', '#8f5b4a', '#6b5b86'];
  var SERIF = "'Instrument Serif', Georgia, serif";
  var BASE = 424, BASE4 = 840;   // ancho de dibujo de la pantalla: dos columnas (teléfono) o cuatro (pantalla ancha)
  var EDADES = ['semilla', 'plántula', 'árbol', 'flor', 'fruto'];

  /* Las nueve pruebas de la revisión para fondos. El límite (`lim`) es el del libro (plantilla
     ppp2-libro-v1, «REVISIÓN PARA FONDOS»: lo vigila tests/ppp2-visor-pagina.test.cjs); el otro lado
     del rango (`tope`) es sólo la escala del dibujo. */
  var PRUEBAS = [
    { k: 'rv_linea_ventas', corto: 'Línea/ventas', nombre: 'Línea / ventas', largo: 'Línea del banco entre ventas', modo: 'max', lim: 0.65, tope: 0, u: '%' },
    { k: 'rv_linea_costo', corto: 'Línea/costo', nombre: 'Línea / costo', largo: 'Línea del banco entre costo con terreno', modo: 'max', lim: 0.5, tope: 0, u: '%' },
    { k: 'rv_meses_credito', corto: 'Meses crédito', nombre: 'Meses de crédito', largo: 'Meses de crédito, del arranque de obra al pago', modo: 'max', lim: 36, tope: 0, u: 'meses' },
    { k: 'rv_aportacion', corto: 'Aportación', nombre: 'Aportación', largo: 'Tierra más capital entre costo', modo: 'min', lim: 0.2, ideal: 0.25, tope: 0.5, u: '%' },
    { k: 'rv_margen', corto: 'Margen/costo', nombre: 'Margen s/ costo', largo: 'Margen antes de financiamiento sobre costo', modo: 'min', lim: 0.2, tope: 0.4, u: '%' },
    { k: 'rv_falta', corto: 'Faltante', nombre: 'Dinero que faltaría', largo: 'Dinero que faltaría (respaldo)', modo: 'cero', lim: 0, u: '$' },
    { k: 'rv_preventa', corto: 'Preventa obra', nombre: 'Preventa al arrancar', largo: 'Preventa firmada al arrancar la obra', modo: 'min', lim: 0.35, tope: 1, u: '%' },
    { k: 'rv_preventa_banco', corto: 'Preventa banco', nombre: 'Preventa al desembolso', largo: 'Preventa firmada antes del primer desembolso', modo: 'min', lim: 0.4, tope: 1, u: '%' },
    { k: 'rv_cobertura', corto: 'Cobertura', nombre: 'Cobertura', largo: 'Por cobrar firmado entre saldo del banco, mínimo', modo: 'min', lim: 1.3, tope: 3, u: '×' }
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
  /* Lo que sale al tocar una figura: título, renglones [nombre, valor], de dónde sale y, si la cifra tiene texto en
     visor-explica.js, su clave (`x`): la leyenda ofrece entonces «Qué es y de qué depende». */
  function T(t, filas, origen, x) {
    var o = { t: t, f: filas || [], o: origen || '' };
    if (x) o.x = x;
    return ' class="vz-t" data-t="' + esc(JSON.stringify(o)) + '"';
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
  var VER = 0, ORIGEN = '', DED = null, ACTUAL = null;
  /* Lo que el servidor marca como deducido (`deducido`: ruta del cuadro → «de qué sale y cómo») viaja pegado al
     origen tras este separador; la leyenda y la hoja lo enseñan aparte, como «deducido de …». */
  var SEP = ' ‖ ';
  /* Las rutas de `deducido` que toca cada origen: «Versiones» = sus claves (v.x), «Datos» = datos.x, «Flujo» = el
     renglón por su rótulo (su serie y su total), «Productos» = los campos que se pueden deducir. */
  var FLUJO_RUTA = {
    'unidades que se firman': 'firmas', 'saldos al escriturar': 'saldos', 'obra directa': 'obra', 'indirectos': 'indirectos', 'imprevistos': 'imprevistos',
    'comisiones': 'comisiones', 'cobranza total': 'cobranza', 'egresos totales': 'egresos', 'enganches al firmar': 'enganches', 'pagos durante la obra': 'pagos_obra',
    'cierre de tierra': 'cierre', 'banco: disposición': 'disposicion', 'banco: pago, interés y apertura': 'pago_banco interes apertura', 'banco: pago': 'pago_banco',
    'banco: interés': 'interes', 'banco: comisión de apertura': 'apertura', 'capital: aportación': 'cap_aporta', 'capital: pago con su rendimiento': 'pago_capital',
    'respaldo: lo que faltaría': 'respaldo', 'respaldo: pago': 'pago_respaldo', 'flujo acumulado': 'flujo_acum', 'caja mínima': 'caja_minima', 'capital: pago': 'pago_capital',
    'saldo del banco': 'saldo_banco', 'caja del proyecto': 'caja'
  };
  function rutasDe(hoja, clave) {
    var c = String(clave || ''), out = [];
    if (hoja === 'Versiones') (c.match(/[a-z][a-z0-9_]*[a-z0-9]/g) || []).forEach(function (k) { out.push('v.' + k); });
    else if (hoja === 'Datos') { if (c) out.push('datos.' + c); }
    else if (hoja === 'Flujo') {
      var k = FLUJO_RUTA[c] || (/^columna del mes/.test(c) ? 'flujo_acum cap_acum saldo_banco saldo_respaldo caja' : '');
      k.split(' ').forEach(function (x) { if (x) out.push('flujo.' + x, 'flujo.total.' + x); });
    } else if (hoja === 'Plan') { if (c) out.push(c.indexOf('plan.') === 0 ? c : 'plan.' + c); }
    else if (hoja === 'Reparto') out.push(c === 'esquema elegido' ? 'reparto.esquema' : 'reparto.*');
    else if (hoja === 'Productos') out.push(/m²/.test(c) ? 'productos.*.m2' : 'productos.*.ventas', 'productos.*.precio_unidad', 'productos.*.precio_m2');
    return out;
  }
  function coincide(patron, ruta) {
    if (patron.indexOf('*') < 0) return patron === ruta;
    return new RegExp('^' + patron.replace(/\./g, '\\.').replace(/\\\.\*$/, '\\..+').replace(/\*/g, '[^.]+') + '$').test(ruta);
  }
  /* «deducido de …»: el texto del servidor, tal cual; si ya dice «deducido» o «corregido», no se repite. */
  function fraseDeducido(t) {
    t = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (/^(deducid|corregid)/i.test(t)) return t.charAt(0).toLowerCase() + t.slice(1);
    return /^el\s/i.test(t) ? 'deducido del ' + t.slice(3) : 'deducido de ' + t.charAt(0).toLowerCase() + t.slice(1);
  }
  function deducidoDe(rutas) {
    if (!DED) return '';
    var textos = [];
    (rutas || []).forEach(function (r) {
      Object.keys(DED).forEach(function (k) { var f = fraseDeducido(DED[k]); if (f && coincide(r, k) && textos.indexOf(f) < 0) textos.push(f); });
    });
    return textos.join(' · ');
  }
  /* Un plan que no viene de un libro (el PPP de siempre) puede traer su propio `origen`: entonces todas las
     leyendas dicen ese texto en lugar del rótulo de la pestaña. */
  function L(hoja, clave, rutas) {
    var base;
    if (ORIGEN) base = ORIGEN;
    else if (hoja === 'Versiones') base = 'Libro · Resumen · ' + String(clave || '').replace(/[a-z][a-z0-9_]*[a-z0-9]/g, function (m) { return 'v' + VER + '.' + m; });
    else if (hoja === 'Flujo') base = 'Libro · Flujo V' + VER + (clave ? ' · ' + clave : '');
    else if (hoja === 'Plan') base = 'Libro · Resumen · ' + (clave || 'plan');
    else base = 'Libro · ' + hoja + (clave ? ' · ' + clave : '');
    var ded = DED ? deducidoDe(rutas || rutasDe(hoja, clave)) : '';
    return ded ? base + SEP + ded : base;
  }
  function Ly(a, b) {
    var pa = String(a).split(SEP), pb = String(b).split(SEP), ded = [];
    pa.slice(1).concat(pb.slice(1)).forEach(function (x) { if (x && ded.indexOf(x) < 0) ded.push(x); });
    var base = ORIGEN || pa[0] + ' y ' + pb[0];
    return ded.length ? base + SEP + ded.join(' · ') : base;
  }
  /* Sólo la nota «deducido de …» de un origen (para el segundo término de Ly cuando ése va escrito a mano). */
  function Lded(hoja, clave) { var d = DED ? deducidoDe(rutasDe(hoja, clave)) : ''; return d ? SEP + d : ''; }
  /* El origen y su nota «deducido de …», separados para pintarlos aparte. */
  function partesOrigen(o) { var p = String(o == null ? '' : o).split(SEP); return { base: p[0], ded: p.slice(1).join(' · ') }; }
  function mayus1(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  /* Un cuadro sin sus datos se ve tranquilo, no como error: un círculo suave, la frase y, si hay, una nota. */
  function sinDatos(w, texto, nota) {
    var cx = w / 2;
    return '<circle cx="' + cx + '" cy="50" r="14" fill="#f3eee4"></circle>' +
      '<g fill="' + ORO + '"><circle cx="' + (cx - 5) + '" cy="50" r="1.5"></circle><circle cx="' + cx + '" cy="50" r="1.5"></circle><circle cx="' + (cx + 5) + '" cy="50" r="1.5"></circle></g>' +
      '<text x="' + cx + '" y="80" text-anchor="middle" font-size="9.5" font-weight="600" fill="' + BODY + '">' + texto + '</text>' +
      (nota ? '<text x="' + cx + '" y="92" text-anchor="middle" font-size="7.6" fill="' + MUTED + '">' + nota + '</text>' : '');
  }
  /* Un dato que no llegó se dice «sin dato» (en gris), nunca un cero ni un guion suelto. */
  function falta(x) { return num(x) === null; }
  function SD(size) { return '<tspan font-size="' + (size || 8) + '" font-weight="400" fill="' + MUTED + '">sin dato</tspan>'; }
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
    var tipTerreno = T('Terreno', [['Superficie', ent(terreno) + ' m²'], ['Estado del dato', (d.datos && d.datos['terreno.m2'] || {}).estado || '—']], L('Datos', 'terreno.m2'), 'datos.terreno.m2');
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
        o.push('<rect' + T(p.nombre, [['Área vendible', ent(p.m2) + ' m²'], ['Parte del vendible', vend ? pct(p.m2 / vend, 0) : '—']], L('Productos', null, ['productos.' + i + '.m2']), 'datos.lamina.m2_vendibles') +
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
      /* tantas casas como unidades tenga el plan (hasta doce en el dibujo); una sola casa se ve como una */
      var casas = '', verdes = '', nU = Math.round(suma(P.map(function (p) { return p.unidades; }))) || 12, nC = Math.min(12, Math.max(1, nU));
      if (nC === 1) { casas = '<rect x="18" y="26" width="54" height="40"></rect>'; verdes = '<rect x="18" y="70" width="54" height="16"></rect>'; }
      else [[5, Math.ceil(nC / 2)], [54, Math.floor(nC / 2)]].forEach(function (c) { for (var i = 0; i < c[1]; i++) { casas += '<rect x="' + c[0] + '" y="' + (6 + 14 * i) + '" width="31" height="13"></rect>'; verdes += '<rect x="' + (c[0] === 5 ? 21 : 55) + '" y="' + (8 + 14 * i) + '" width="14" height="9"></rect>'; } });
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
    o.push('<g' + T('Construcción total', [['Construcción', constr ? ent(constr) + ' m²' : 'sin capturar'], ['Estado del dato', (d.datos && d.datos['lamina.m2_construidos'] || {}).estado || '—']], L('Datos', 'lamina.m2_construidos'), 'datos.lamina.m2_construidos') + '>' +
      '<text x="102" y="16" font-size="8" fill="' + MUTED + '">Construcción total</text><text x="102" y="28" font-size="11" font-weight="700" fill="' + (constr ? INK : MUTED) + '">' + (constr ? ent(constr) + ' m²' : SD(9)) + '</text></g>');
    o.push('<g' + T('Área vendible', [['Vendible', ent(vend) + ' m²']].concat(constr && vend ? [['Vendible ÷ construcción', pct(vend / constr, 1)]] : []), L('Productos', 'suma de m² vendibles'), 'datos.lamina.m2_vendibles') + '>' +
      '<text x="102" y="56" font-size="8" fill="' + ORO + '">Vendible' + parte + '</text><text x="102" y="68" font-size="11" font-weight="700" fill="' + (vend ? INK : MUTED) + '">' + (vend ? ent(vend) + ' m²' : SD(9)) + '</text></g>');
    o.push('<g' + tipTerreno + '><text x="1" y="121" font-size="7.4" font-weight="700" letter-spacing="0.6" fill="' + MUTED + '">TERRENO</text><text x="1" y="133.5" font-size="11" font-weight="700" fill="' + INK + '">' + (falta(terreno) ? SD(9) : ent(terreno) + ' m²') + '</text></g>');
    o.push('<g' + T('Tierra', [['Valor de la tierra', mdp(tierra)], ['Ventas', mdp(ventas)]].concat(tierra && ventas ? [['Tierra ÷ ventas', pct(tierra / ventas, 1)]] : []), L('Versiones', 'tierra y ventas'), 'v.tierra') + '>' +
      '<text x="76" y="121" font-size="7.4" font-weight="700" letter-spacing="0.6" fill="' + MUTED + '">TIERRA</text><text x="76" y="133.5" font-size="11" font-weight="700" fill="' + INK + '">' + (falta(tierra) ? SD(9) : mdp(tierra)) +
      (tierra && ventas ? '<tspan font-size="7.6" font-weight="400" fill="' + MUTED + '"> · ' + pct(tierra / ventas, 1) + ' de ventas</tspan>' : '') + '</text></g>');
    var sub = corta(String((d.plan && d.plan.tipo) || '').split(/[:(]/)[0].trim().toLowerCase(), 24);
    return {
      id: 'terreno', n: 1, titulo: 'Terreno', sub: esc(sub), svg: falta(terreno) && !constr && !vend && falta(tierra) ? sinDatos(184, 'Aún no hay terreno capturado') : o.join(''), w: 184,
      aria: 'Terreno: ' + ent(terreno) + ' m², tierra ' + mdp(tierra) + ', construcción ' + ent(constr) + ' m², vendible ' + ent(vend) + ' m²',
      detalle: [{ h: 'Terreno y cabida', filas: [
        ['Superficie del terreno', ent(terreno) + ' m²', L('Datos', 'terreno.m2'), 'datos.terreno.m2'],
        ['Valor de la tierra', mdp(tierra), L('Versiones', 'tierra'), 'v.tierra'],
        ['Tierra entre ventas', tierra && ventas ? pct(tierra / ventas, 1) : '—', 'tierra ÷ ventas', 'visor.tierra_ventas'],
        ['Construcción total', constr ? ent(constr) + ' m²' : '—', L('Datos', 'lamina.m2_construidos'), 'datos.lamina.m2_construidos'],
        ['Área vendible', ent(vend) + ' m²', L('Productos', null, ['productos.*.m2']), 'datos.lamina.m2_vendibles'],
        ['Vendible entre construcción', constr && vend ? pct(vend / constr, 1) : '—', 'vendible ÷ construcción', 'visor.vendible_construccion']
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
          ['Precio por m²', '$' + ent(p.precio_m2)], ['Precio por unidad', mdp(p.precio_unidad) + ' MDP']], L('Productos', null, ['productos.' + b.i + '.ventas', 'productos.' + b.i + '.precio_unidad', 'productos.' + b.i + '.precio_m2']), 'productos');
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
      '<text x="10" y="131" font-size="8" fill="' + MUTED + '">= 1 unidad</text>');
    o.push('<text' + T('Ventas totales', ventasPorProducto(d).concat([['Total de ventas', mdp(ventas)], ['Unidades', ent(unidades)], ['Área vendible', ent(tot) + ' m²']]), Ly(L('Productos'), 'Resumen · v' + d.version + '.ventas' + Lded('Versiones', 'ventas')), 'v.ventas') + ' x="184" y="131.5" text-anchor="end" font-size="10.5" font-weight="700" fill="' + INK + '">' + mdp(ventas) + '</text>');
    return {
      id: 'producto', n: 2, titulo: 'Producto', sub: n ? ent(tot) + ' m² vendibles' : '', svg: n ? o.join('') : sinDatos(184, 'Aún no hay productos capturados'), w: 184,
      aria: 'Producto: ' + n + ' productos, ' + ent(unidades) + ' unidades, ventas ' + mdp(ventas),
      detalle: [{ h: 'Ventas por producto (MDP)', filas: (d.productos || []).map(function (p, i) {
        var ded = deducidoDe(['productos.' + i + '.ventas', 'productos.' + i + '.precio_unidad', 'productos.' + i + '.precio_m2']);
        return [p.nombre, mdp(p.ventas), ent(p.unidades) + ' u · ' + ent(p.m2) + ' m² · $' + ent(p.precio_m2) + '/m² · ' + mdp(p.precio_unidad) + ' por unidad' + (ded ? SEP + ded : ''), 'productos'];
      }).concat([['Total', mdp(ventas), ent(unidades) + ' u · ' + ent(tot) + ' m² · ' + L('Productos'), 'v.ventas']]) }]
    };
  }

  /* ───────────────────────── 3 · Tiempo ───────────────────────── */
  function regla(N, x0, x1) {
    x0 = x0 == null ? 48 : x0; x1 = x1 == null ? 182 : x1;
    var pm = (x1 - x0) / Math.max(1, N);
    return { pm: pm, x0: x0, x1: x1, X: function (m) { return x0 + (m - 1) * pm; }, XE: function (m) { return x0 + m * pm; } };
  }
  /* La escala de Tiempo y Dinero en el cuadro chico es siempre la de un plan normal (60 meses a la vista).
     Un plan más largo se dibuja a lo largo y se recorre de lado (dos dedos, rueda o arrastrar con el ratón);
     un desvanecido en el borde dice que hay más. En la hoja, la figura grande va completa. */
  var VISTA = 60;
  function reglaPan(N, x0, x1) {
    if (N <= VISTA) return regla(N, x0, x1);
    var r = regla(N, x0, x0 + (x1 - x0) * N / VISTA); r.vista = x1; return r;
  }
  function panWrap(id, inner, R, y0, y1) {
    if (!R.vista) return inner;
    var ancho0 = R.vista - R.x0, max = R.x1 - R.vista, h = y1 - y0;
    return '<defs><clipPath id="vzRec' + id + '"><rect x="' + f1(R.x0 - 1) + '" y="' + y0 + '" width="' + f1(ancho0 + 2) + '" height="' + h + '"></rect></clipPath>' +
      '<linearGradient id="vzDesD' + id + '" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fffdf9" stop-opacity="0"></stop><stop offset="1" stop-color="#fffdf9" stop-opacity="0.95"></stop></linearGradient>' +
      '<linearGradient id="vzDesI' + id + '" x1="1" x2="0" y1="0" y2="0"><stop offset="0" stop-color="#fffdf9" stop-opacity="0"></stop><stop offset="1" stop-color="#fffdf9" stop-opacity="0.95"></stop></linearGradient></defs>' +
      '<g clip-path="url(#vzRec' + id + ')"><g class="vz-pan" data-pan-max="' + f1(max) + '" data-off="0" transform="translate(0 0)">' + inner + '</g></g>' +
      '<rect class="vz-des-i" x="' + f1(R.x0 - 1) + '" y="' + y0 + '" width="16" height="' + h + '" fill="url(#vzDesI' + id + ')" opacity="0" pointer-events="none"></rect>' +
      '<rect class="vz-des-d" x="' + f1(R.vista - 15) + '" y="' + y0 + '" width="16" height="' + h + '" fill="url(#vzDesD' + id + ')" pointer-events="none"></rect>' +
      '<path class="vz-des-d" d="M' + f1(R.vista - 4) + ' ' + f1(y0 + h / 2 - 3) + ' l3 3 l-3 3" fill="none" stroke="' + MUTED + '" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"></path>';
  }
  function marcasMes(d, N) {
    var v = d.v || {}, cand = [1, num(v.obra_inicio), num(v.fin_obra), N], out = [];
    cand.forEach(function (m) { if (m && m >= 1 && m <= N && out.indexOf(m) < 0) out.push(m); });
    return out.sort(function (a, b) { return a - b; });
  }
  /* Horizontes largos (más de cuatro años, hay planes de más de 150 meses): marcas por año y rótulos cada
     uno, dos, tres o cinco años según quepan; al final, el último mes. */
  function ejeAnios(N, yLinea, yTexto, R) {
    var o = '<line x1="' + R.x0 + '" y1="' + yLinea + '" x2="' + R.x1 + '" y2="' + yLinea + '" stroke="#cfc6b3" stroke-width="0.8"></line>', anios = Math.floor(N / 12), cada = 1;
    [1, 2, 3, 5, 10].some(function (c) { cada = c; return 12 * c * R.pm >= 22; });
    var finTxt = 'mes ' + N, finX = R.x1 - ancho(finTxt, 7.2) - 4, ult = R.x0 + 3 + ancho('año', 7.2);
    o += '<text x="' + R.x0 + '" y="' + yTexto + '" font-size="7.2" fill="' + MUTED + '">año</text>';
    for (var a = 1; a <= anios; a++) {
      var x = R.XE(12 * a);
      o += '<line x1="' + f1(x) + '" y1="' + (yLinea - 1.6) + '" x2="' + f1(x) + '" y2="' + (yLinea + 1.6) + '" stroke="#b9b1a1" stroke-width="0.7"></line>';
      if (a % cada === 0 && x - ult > 8 && x + 6 < finX) { o += '<text x="' + f1(x) + '" y="' + yTexto + '" text-anchor="middle" font-size="7.2" fill="' + MUTED + '">' + a + '</text>'; ult = x + 4; }
    }
    return o + '<text x="' + R.x1 + '" y="' + yTexto + '" text-anchor="end" font-size="7.2" fill="' + MUTED + '">' + finTxt + '</text>';
  }
  function ejeMeses(d, N, yLinea, yTexto, R) {
    R = R || regla(N);
    if (N > 48 && !R.vista) return ejeAnios(N, yLinea, yTexto, R);
    var o = '<line x1="' + R.x0 + '" y1="' + yLinea + '" x2="' + R.x1 + '" y2="' + yLinea + '" stroke="#cfc6b3" stroke-width="0.8"></line>', ms = marcasMes(d, N), ult = -99;
    if (R.vista) { for (var m12 = 12; m12 < N; m12 += 12) if (ms.indexOf(m12) < 0) ms.push(m12); ms.sort(function (a, b) { return a - b; }); }   // a lo largo: también cada año
    ms.forEach(function (m, i) {
      var fin = i === ms.length - 1 && m === N, ini = i === 0 && m === 1 && R.x0 < 8, x = fin ? R.x1 : (ini ? R.x0 : R.X(m));
      if (x - ult < 11 && !fin) return;
      if (fin && x - ult < 34) o = o.replace(/<text[^>]*>[^<]*<\/text>$/, '');
      o += '<text x="' + f1(x) + '" y="' + yTexto + '" text-anchor="' + (fin ? 'end' : (ini ? 'start' : 'middle')) + '" font-size="7.2" fill="' + MUTED + '">' + (fin || ini ? 'mes ' : '') + m + '</text>';
      ult = x;
    });
    return o;
  }
  /* Reparto de la copia de prueba del Árbol (SPPP · T-10, corrección 1 por el dictamen T-11). Sólo existe si el paquete trae «cascada»;
     sin él (todos los paquetes del libro), el visor pinta igual que siempre. Con él: el mes del motor es un hito de referencia (N-02), la fecha
     que se presenta es la del corte autorizado y un pago sólo existe si está registrado; un negativo es «pérdida asignada (teórica)» (C1) y un
     reparto inválido o bloqueado lo dice en lugar de presentar cifras como pagos. */
  function repartoT10(d) {
    var c = d && d.cascada;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    var f = c.fechas || {}, val = function (x) { return x && num(x.valor) !== null ? x.valor : null; };
    // En los paquetes v2 una fecha podía figurar como registrada con importe cero.
    var registro = f.pago_registrado, dueno = c.conciliacion && c.conciliacion.DUENO;
    if (registro && registro.estado === 'registrado' && val(registro) !== null && !(dueno && num(dueno.pagado) > 0)) {
      f = Object.assign({}, f, { pago_registrado: { estado: 'inconsistente', valor: null, fecha_sin_importe: registro.valor } });
    }
    var estado = typeof c.estado === 'string' && c.estado ? c.estado : 'SIN CALCULAR';
    var hito = val(f.hito_motor); if (hito === null) hito = num((d.v || {}).mes_reparto);
    return { estado: estado, bloqueado: !c.ok || /^(INVÁLIDO|BLOQUEADO|SIN CALCULAR)/.test(estado), autorizable: /^AUTORIZABLE/.test(estado),
      motivos: (Array.isArray(c.motivos) ? c.motivos : (c.motivo ? [c.motivo] : [])).slice(0, 4), hito: hito, corte: val(f.corte_autorizado),
      /* N01 (dictamen T-11 v2): sólo es pago lo que el libro registra con importe; una fecha sin importe se informa como inconsistente y nunca desplaza el corte */
      pago: f.pago_registrado && f.pago_registrado.estado === 'registrado' ? val(f.pago_registrado) : null,
      sinImporte: f.pago_registrado && f.pago_registrado.estado === 'inconsistente' ? (num(f.pago_registrado.fecha_sin_importe) !== null ? f.pago_registrado.fecha_sin_importe : '—') : null, campos: c.campos || {} };
  }
  function pagoT10(RC) {
    if (RC.pago) return 'mes ' + RC.pago;
    return 'sin pago registrado' + (RC.sinImporte !== null ? ' · fecha sin importe (mes ' + RC.sinImporte + '): inconsistente, no es pago' : '');
  }
  function publicaT10(RC, k) { return !!RC && !RC.bloqueado && !!RC.campos[k] && RC.campos[k].rotulo === 'publicable'; }
  function recibeT10(RC, k, x, txt) {
    if (!RC) return txt;
    if (num(x) !== null && x < 0) return 'pérdida asignada ' + mdp(x) + ' (teórica)';
    return txt + (publicaT10(RC, k) ? '' : ' (teórico)');
  }
  function fechaT10(RC) {
    /* el corte autorizado (o su ausencia) va siempre primero: un pago, o una fecha sin importe, se agrega a su lado y nunca lo sustituye */
    var sin = RC.sinImporte !== null ? 'fecha de pago del mes ' + RC.sinImporte + ' sin importe: inconsistente' : '';
    var corte = RC.corte ? 'corte autorizado: mes ' + RC.corte : 'sin corte autorizado' + (RC.hito ? ' (hito del motor: mes ' + RC.hito + ', referencia)' : '');
    if (RC.pago) return corte + ' · pago registrado al dueño: mes ' + RC.pago;
    if (RC.corte) return corte + ' (sin pago registrado' + (sin ? '; ' + sin : '') + ')';
    return corte + (sin ? ' · sin pago registrado; ' + sin : '');
  }
  function cTiempo(d) {
    var v = d.v || {}, N = Math.max(1, (d.flujo && d.flujo.meses) || num(v.mes_reparto) || 1), o = [];
    var firmas = fila(d, 'firmas'), saldos = fila(d, 'saldos'), vi = primero(firmas), vf = ultimo(firmas), ei = primero(saldos), ef = ultimo(saldos);
    var RC = repartoT10(d), oi = num(v.obra_inicio), of = num(v.fin_obra), rep = RC ? (RC.corte || RC.hito) : num(v.mes_reparto), prev = num(v.rv_preventa), pmin = num(dato(d, 'din.preventa_minima'));
    var unidades = total(d, 'firmas'), mesesVenta = vi && vf ? vf - vi + 1 : 0, corto = prev !== null && pmin !== null && prev < pmin;
    var rows = [['Ventas', vi, vf, TIE, 'Meses con firmas', L('Flujo', 'unidades que se firman'), 'flujo.firmas'], ['Obra', oi, of, CAP, 'Meses de obra', L('Versiones', 'obra_inicio y fin_obra'), 'v.fin_obra'], ['Escrituras', ei, ef, CLI, 'Meses en que se cobran los saldos', L('Flujo', 'saldos al escriturar'), 'flujo.saldos']];
    /* la parte que corre con el tiempo (barras, arranque, reparto, eje) y la que se queda (nombres de renglón) */
    function grafica(grande) {
      var R = grande ? regla(N) : reglaPan(N, 48, 182), p = [], f = [];
      if (oi) {
        /* a lo largo, el rótulo va dentro del recorte de la gráfica: no puede empezar antes del eje */
        var wA = ancho('arranca la obra · ' + (prev === null ? 'mes ' + oi : pct(prev) + ' vendido'), 7.5);
        var tx = clamp(R.X(oi), R.vista ? R.x0 + wA / 2 + 1 : R.x0 + 2, R.x1 - 48);
        p.push('<line x1="' + f1(R.X(oi)) + '" y1="12" x2="' + f1(R.X(oi)) + '" y2="78" stroke="' + TIE + '" stroke-width="0.9" stroke-dasharray="2 2"></line>' +
          '<text' + T('Arranque de obra', [['Mes de arranque', 'mes ' + oi], ['Preventa firmada al arrancar', pct(prev)], ['Mínimo para arrancar', pct(pmin, 0)]], L('Versiones', 'obra_inicio y rv_preventa'), 'v.rv_preventa') +
          ' x="' + f1(tx) + '" y="8.5" text-anchor="middle" font-size="7.5" fill="' + ORO + '">arranca la obra · <tspan font-weight="700"' + (corto ? ' fill="' + BADT + '"' : '') + '>' + (prev === null ? 'mes ' + oi : pct(prev) + ' vendido') + '</tspan></text>');
      }
      rows.forEach(function (r, i) {
        var y = 16 + i * 16, a = r[1], b = r[2];
        f.push('<text x="0" y="' + (y + 7.8) + '" font-size="8.6" fill="' + BODY + '">' + r[0] + '</text>');
        if (!a || !b) { f.push('<text x="48" y="' + (y + 7.6) + '" font-size="7.2" fill="' + MUTED + '">sin dato</text>'); return; }
        var w = (b - a + 1) * R.pm, txt = (b - a + 1) + ' meses';
        p.push('<g' + T(r[0], [['Del mes', a], ['Al mes', b], ['Duración', txt]].concat(i === 0 && unidades ? [['Unidades que se firman', ent(unidades)]] : []), r[5], r[6]) + '><rect x="' + f1(R.X(a)) + '" y="' + y + '" width="' + f1(w) + '" height="10" rx="3" fill="' + r[3] + '"></rect>' +
          (w >= ancho(txt, 7.5, true) + 8 ? '<text x="' + f1(R.X(a) + 4) + '" y="' + (y + 7.6) + '" font-size="7.5" font-weight="600" fill="#fffdf9">' + txt + '</text>' : '') + '</g>');
      });
      if (rep && RC) {
        /* N-02: el corte autorizado se marca lleno; sin corte, el hito del motor va hueco y dice que es referencia */
        var cxT = clamp(R.XE(rep) - 3.5, R.x0 + 4, R.x1 - 2), trT = T('Reparto · ' + RC.estado, [['Corte autorizado', RC.corte ? 'mes ' + RC.corte : 'sin fecha autorizada'], ['Hito del motor (referencia del Árbol)', RC.hito ? 'mes ' + RC.hito : '—'], ['Pago registrado', pagoT10(RC)]], L('Versiones', 'mes_reparto'), 'v.mes_reparto');
        f.push('<text' + trT + ' x="0" y="71.5" font-size="8.5" font-weight="700" fill="' + INK + '">Reparto</text>');
        p.push('<g' + trT + '><circle cx="' + f1(cxT) + '" cy="69" r="3.5" fill="' + (RC.corte ? INK : 'none') + '" stroke="' + INK + '" stroke-width="0.9"></circle><text x="' + f1(cxT - 6.5) + '" y="71.6" text-anchor="end" font-size="7.5" font-weight="700" fill="' + INK + '">' + (RC.corte ? 'corte ' + RC.corte : 'hito ' + rep + ' (ref.)') + '</text></g>');
      } else if (rep) {
        var cx = clamp(R.XE(rep) - 3.5, R.x0 + 4, R.x1 - 2), tr = T('Reparto', [['Mes del reparto', 'mes ' + rep], ['El dueño recibe lo último en el mes', num(v.dueno_meses) || '—']], L('Versiones', 'mes_reparto'), 'v.mes_reparto');
        f.push('<text' + tr + ' x="0" y="71.5" font-size="8.5" font-weight="700" fill="' + INK + '">Reparto</text>');
        p.push('<g' + tr + '><circle cx="' + f1(cx) + '" cy="69" r="3.5" fill="' + INK + '"></circle><text x="' + f1(cx - 6.5) + '" y="71.6" text-anchor="end" font-size="7.5" font-weight="700" fill="' + INK + '">mes ' + rep + '</text></g>');
      }
      p.push(ejeMeses(d, N, 81, 89, R));
      return f.join('') + panWrap('T', p.join(''), R, 0, 92);
    }
    var kpis = [
      RC ? (RC.corte ? [String(RC.corte), 'mes del corte', 'reparto autorizado', T('Corte autorizado', [['Corte autorizado', 'mes ' + RC.corte], ['Hito del motor (referencia)', RC.hito ? 'mes ' + RC.hito : '—']], L('Versiones', 'mes_reparto'), 'v.mes_reparto')]
        : [RC.hito ? String(RC.hito) : '—', 'hito del motor', 'referencia, sin autorizar', T('Hito del motor', [['Hito del motor (referencia del Árbol)', RC.hito ? 'mes ' + RC.hito : '—'], ['Corte autorizado', 'sin fecha autorizada'], ['Estado del reparto', RC.estado]], L('Versiones', 'mes_reparto'), 'v.mes_reparto')])
      : [rep ? String(rep) : '—', 'meses de plazo', 'firma a reparto', T('Plazo', [['Mes del reparto', rep || '—']], L('Versiones', 'mes_reparto'), 'v.mes_reparto')],
      [pct(prev), 'preventa', pmin !== null ? 'mínimo ' + pct(pmin, 0) : '', T('Preventa al arrancar la obra', [['Preventa firmada', pct(prev)], ['Mínimo', pct(pmin, 0)]], L('Versiones', 'rv_preventa'), 'v.rv_preventa')],
      [mesesVenta && unidades ? f1(unidades / mesesVenta) : '—', 'unidades al mes', mesesVenta ? pct(1 / mesesVenta) + ' del total' : '',
        T('Ritmo de venta', [['Unidades', ent(unidades)], ['Meses de venta', mesesVenta || '—'], ['Unidades ÷ meses', mesesVenta && unidades ? f1(unidades / mesesVenta) : '—']], L('Flujo', 'unidades que se firman'), 'visor.ritmo')]
    ];
    kpis = kpis.filter(function (kp) { return kp[0] !== '—' && kp[0] !== '—%'; });
    kpis.forEach(function (kp, i) {
      var x = i * 62;
      if (i) o.push('<line x1="' + (x - 4) + '" y1="98" x2="' + (x - 4) + '" y2="134" stroke="#e1dacb" stroke-width="0.8"></line>');
      o.push('<g' + kp[3] + '><text x="' + x + '" y="112" font-size="14" font-weight="700" fill="' + (kp[1] === 'preventa' && corto ? BADT : INK) + '">' + kp[0] + '</text><text x="' + x + '" y="123" font-size="7.5" fill="' + BODY + '">' + kp[1] + '</text>' +
        (kp[2] ? '<text x="' + x + '" y="132.5" font-size="7.2" fill="' + MUTED + '">' + kp[2] + '</text>' : '') + '</g>');
    });
    return {
      id: 'tiempo', n: 3, titulo: 'Tiempo', sub: 'etapas y cifras', w: 184, wG: 184, hG: 136,
      svg: d.flujo && d.flujo.meses && (vi || oi || rep) ? grafica(false) + o.join('') : sinDatos(184, 'Aún no hay calendario calculado'),
      svgG: d.flujo && d.flujo.meses && (vi || oi || rep) ? grafica(true) + o.join('') : sinDatos(184, 'Aún no hay calendario calculado'),
      aria: 'Tiempo: ventas del mes ' + vi + ' al ' + vf + ', obra del ' + oi + ' al ' + of + (RC ? ', ' + (RC.corte ? 'corte de reparto autorizado en el mes ' + RC.corte : 'sin corte de reparto autorizado' + (RC.hito ? ' (hito del motor: mes ' + RC.hito + ', referencia)' : '')) : ', reparto en el mes ' + rep),
      detalle: [{ h: 'Calendario (meses del plan)', filas: [
        ['Ventas', vi ? 'mes ' + vi + ' a ' + vf : '—', (mesesVenta ? mesesVenta + ' meses · ' : '') + L('Flujo', 'unidades que se firman'), 'flujo.firmas'],
        ['Obra', oi ? 'mes ' + oi + ' a ' + of : '—', L('Versiones', 'obra_inicio y fin_obra'), 'v.fin_obra'],
        ['Escrituras', ei ? 'mes ' + ei + ' a ' + ef : '—', L('Flujo', 'saldos al escriturar'), 'flujo.saldos'],
        ['Banco liquidado', num(v.banco_mes) ? 'mes ' + v.banco_mes : '—', L('Versiones', 'banco_mes'), 'v.banco_mes'],
        ['Capital liquidado', num(v.capital_mes) ? 'mes ' + v.capital_mes : '—', L('Versiones', 'capital_mes'), 'v.capital_mes'],
      ].concat(RC ? [
        ['Hito del motor (referencia del Árbol)', RC.hito ? 'mes ' + RC.hito : '—', L('Versiones', 'mes_reparto'), 'v.mes_reparto'],
        ['Corte autorizado', RC.corte ? 'mes ' + RC.corte : 'sin fecha autorizada', 'Reparto · ' + RC.estado, 'cascada.fechas'],
        ['Pago registrado al dueño', pagoT10(RC), 'Libro de pagos (fuera del Árbol)', 'cascada.fechas']
      ] : [['Reparto', rep ? 'mes ' + rep : '—', L('Versiones', 'mes_reparto'), 'v.mes_reparto']]) }, { h: 'Ritmo', filas: [
        ['Preventa al arrancar la obra', pct(prev), 'mínimo ' + pct(pmin, 0) + ' · ' + L('Versiones', 'rv_preventa'), 'v.rv_preventa'],
        ['Unidades por mes', mesesVenta && unidades ? f1(unidades / mesesVenta) : '—', mesesVenta && unidades ? ent(unidades) + ' unidades ÷ ' + mesesVenta + ' meses' : L('Flujo', 'unidades que se firman'), 'visor.ritmo']
      ] }]
    };
  }

  /* ───────────────────────── 4 · Costo y ganancia ───────────────────────── */
  function cCosto(d) {
    var v = d.v || {}, ventas = num(v.ventas) || 0, tierra = num(v.tierra) || 0, cierre = total(d, 'cierre') || 0, gan = num(v.ganancia);
    var rend = num(v.rend_capital) || 0, costoDin = num(v.costo_dinero) || 0, banco = Math.max(0, costoDin - rend), sinTierra = num(v.costo_sin_tierra) || 0;
    var items = [
      ['Terreno', tierra + cierre, '#9a7b3f', [['Valor de la tierra', mdp(tierra)], ['Cierre de tierra', mdp(cierre)]], Ly(L('Versiones', 'tierra'), 'Flujo V' + d.version + ' · cierre de tierra' + Lded('Flujo', 'cierre de tierra')), null, 'v.tierra'],
      ['Costos directos', total(d, 'obra') || 0, '#b06a5f', [['Obra directa', mdp(total(d, 'obra'))]], L('Flujo', 'obra directa'), null, 'flujo.obra'],
      ['Costos indirectos', total(d, 'indirectos') || 0, '#d39a6a', [['Indirectos', mdp(total(d, 'indirectos'))]], L('Flujo', 'indirectos'), null, 'flujo.indirectos'],
      ['Contingencias', total(d, 'imprevistos') || 0, '#e2c08d', [['Imprevistos', mdp(total(d, 'imprevistos'))]], L('Flujo', 'imprevistos'), null, 'flujo.imprevistos'],
      ['Comisiones de venta', total(d, 'comisiones') || 0, '#8f7a9e', [['Comisiones', mdp(total(d, 'comisiones'))], ['Comisión sobre ventas', pct(num(dato(d, 'costo.comision')))]], L('Flujo', 'comisiones'), null, 'flujo.comisiones'],
      ['Intereses y apertura', banco, '#3e6484', [['Intereses del banco', mdp(total(d, 'interes'))], ['Comisión de apertura', mdp(total(d, 'apertura'))], ['Costo del dinero menos rendimiento del capital', mdp(banco)]], L('Versiones', 'costo_dinero − rend_capital'), null, 'v.costo_dinero'],
      ['Retorno del capital', rend, '#7d9cbc', [['Rendimiento pagado al capital', mdp(rend)], ['Tasa anual', pct(num(dato(d, 'din.tasa_capital')), 0)]], L('Versiones', 'rend_capital'), null, 'v.rend_capital']
    ].filter(function (it) { return it[1] > 0.05; });
    var pierde = gan !== null && gan < 0;
    if (!pierde && gan !== null) items.push(['Utilidad antes de ISR', gan, CLI, [['Ganancia real, después de la tierra', mdp(gan)], ['Sobre ventas', pct(num(v.margen))]], L('Versiones', 'ganancia'), null, 'v.ganancia']);
    /* Equivalente en renta: el Árbol manda v.renta_* sólo si el plan trae una renta (producto Consultorios y oficinas); aquí sólo se pinta. */
    var rentaA = num(v.renta_anual), hayRenta = rentaA !== null && rentaA > 0, bajo = hayRenta ? 9 : 0;
    var RX = 60, g = 3.6, top = 2, H = 112 - bajo, suman = suma(items.map(function (it) { return it[1]; })) || 1;
    var sc = (H - g * (items.length - 1)) / suman, lh = suman * sc, yl = top + (H - lh) / 2, yr = top, o = [], centros = [];
    o.push('<rect' + T('Ingresos por ventas', ventasPorProducto(d).concat([['Total de ventas', mdp(ventas)]]), Ly(L('Productos'), 'Resumen · v' + d.version + '.ventas' + Lded('Versiones', 'ventas')), 'v.ventas') + ' x="0" y="' + f1(yl) + '" width="6" height="' + f1(lh) + '" rx="1.5" fill="' + INK + '"></rect>');
    items.forEach(function (it) {
      var h = it[1] * sc, xm = (6 + RX) / 2;
      var filasIt = it[3].concat(it[3].length > 1 ? [['Total', mdp(it[1])]] : []).concat([['De cada $100 de ventas', ventas ? '$' + f1(it[1] / ventas * 100) : '—']]);
      it[5] = filasIt;
      o.push('<g' + T(it[0], filasIt, it[4], it[6]) + '>' +
        '<path d="M6 ' + f1(yl) + ' C' + f1(xm) + ' ' + f1(yl) + ' ' + f1(xm) + ' ' + f1(yr) + ' ' + RX + ' ' + f1(yr) + ' L' + RX + ' ' + f1(yr + h) + ' C' + f1(xm) + ' ' + f1(yr + h) + ' ' + f1(xm) + ' ' + f1(yl + h) + ' 6 ' + f1(yl + h) + ' Z" fill="' + it[2] + '" fill-opacity="0.42"></path>' +
        '<rect x="' + RX + '" y="' + f1(yr) + '" width="6" height="' + f1(Math.max(h, 1.2)) + '" fill="' + it[2] + '"></rect></g>');
      centros.push([it, yr + h / 2]);
      yl += h; yr += h + g;
    });
    var ys = spread(centros.map(function (c) { return c[1] + 2.6; }), 10.2, 8, 113 - bajo);
    centros.forEach(function (c, i) {
      var it = c[0], fin = it[0] === 'Utilidad antes de ISR', ly = ys[i];
      o.push('<polyline points="' + (RX + 7) + ',' + f1(c[1]) + ' ' + (RX + 9) + ',' + f1(ly - 2.5) + ' ' + (RX + 11) + ',' + f1(ly - 2.5) + '" fill="none" stroke="' + GRIS + '" stroke-width="0.6"></polyline>' +
        '<g' + T(it[0], it[5], it[4], it[6]) + '><text x="' + (RX + 13) + '" y="' + f1(ly) + '" font-size="7.4"' + (fin ? ' font-weight="700"' : '') + ' fill="' + (fin ? CLIT : BODY) + '">' + it[0] + '</text>' +
        '<text x="184" y="' + f1(ly) + '" text-anchor="end" font-size="8.2" font-weight="700" fill="' + (fin ? CLIT : INK) + '">' + mdp(it[1]) + '</text></g>');
    });
    var hayCosto = num(v.costo_sin_tierra) !== null, costoTotal = sinTierra + tierra, antes = ventas - costoTotal, margen = num(v.rv_margen);
    o.push('<text' + T('Ventas y costo total', ventasPorProducto(d).concat([['Ingresos por ventas', mdp(ventas)], ['Costo sin tierra', mdp(sinTierra)], ['Tierra', mdp(tierra)], ['Costo total con tierra', mdp(costoTotal)]]), L('Versiones', 'ventas, costo_sin_tierra y tierra'), 'visor.costo_total') +
      ' x="0" y="' + f1(124 - bajo) + '" font-size="7.4" fill="' + MUTED + '">Ventas <tspan font-weight="700" fill="' + INK + '">' + mdp(ventas) + '</tspan>' + (hayCosto ? ' · costo total ' + mdp(costoTotal) : '') + '</text>');
    if (pierde || hayCosto) o.push('<text' + T('Utilidad antes de intereses', [['Ventas menos costo total', mdp(antes)], ['Margen sobre costo', pct(num(v.rv_margen))], ['Costo del dinero', mdp(costoDin)], ['Ganancia real', mdp(gan)]], L('Versiones', 'rv_margen, costo_dinero y ganancia'), 'visor.antes_intereses') +
      ' x="0" y="' + f1(133.8 - bajo) + '" font-size="7.4" fill="' + MUTED + '">' + (pierde ? 'Pérdida después del costo del dinero <tspan font-weight="700" fill="' + BADT + '">' + mdp(gan) + '</tspan>'
        : 'Antes de intereses <tspan font-weight="700" fill="' + ORO + '">' + mdp(antes) + '</tspan>' + (margen !== null ? ' · ' + pct(margen) + ' sobre costo' : '')) + '</text>');
    var rentaValor = num(v.renta_valor), rentaRinde = num(v.renta_rinde), filasRenta = [
      ['Renta por m² al mes', num(v.renta_m2) !== null ? '$' + ent(num(v.renta_m2)) : '—', 'Árbol PPP · renta mensual por m²', 'v.renta_m2'],
      ['Renta al año', mdp(rentaA), 'Árbol PPP · todo lo vendible rentado 12 meses', 'v.renta_anual'],
      ['Tasa de capitalización', pct(num(v.renta_tasa)), 'Árbol PPP · lo que espera ganar al año quien compra rentado', 'v.renta_tasa'],
      ['Valor en renta', mdp(rentaValor), 'Árbol PPP · renta al año ÷ tasa de capitalización', 'v.renta_valor'],
      ['Rinde la renta sobre el costo', pct(rentaRinde), 'Árbol PPP · renta al año ÷ costo total', 'v.renta_rinde']
    ];
    if (hayRenta) o.push('<text' + T('Si se renta en vez de vender', filasRenta.map(function (f) { return [f[0], f[1]]; }), 'Árbol PPP · equivalente en renta', 'v.renta_anual') +
      ' x="0" y="134.6" font-size="7.4" fill="' + MUTED + '">Renta <tspan font-weight="700" fill="' + INK + '">' + mdp(rentaA) + '</tspan>/año' + (rentaValor !== null ? ' · vale ' + mdp(rentaValor) : '') + (rentaRinde !== null ? ' · rinde ' + pct(rentaRinde) : '') + '</text>');
    return {
      id: 'costo', n: 4, titulo: 'Costo y ganancia', sub: 'flujo', svg: ventas && items.length ? o.join('') : sinDatos(184, 'Aún no hay cifras calculadas'), w: 184,
      aria: 'Costo y ganancia: ventas ' + mdp(ventas) + ', costo total ' + mdp(costoTotal) + ', utilidad antes de ISR ' + mdp(gan),
      detalle: [{ h: 'De las ventas a la utilidad (MDP)', filas: [['Ingresos por ventas', mdp(ventas), L('Versiones', 'ventas'), 'v.ventas']].concat(items.map(function (it) {
        return ['− ' + it[0], mdp(it[1]), it[4], it[6]];
      })).concat(pierde ? [['Pérdida', mdp(gan), L('Versiones', 'ganancia'), 'v.ganancia']] : []) }, { h: 'Cortes', filas: [
        ['Costo sin tierra', mdp(num(v.costo_sin_tierra)), L('Versiones', 'costo_sin_tierra'), 'v.costo_sin_tierra'],
        ['Costo total con tierra', mdp(costoTotal), 'costo sin tierra + tierra', 'visor.costo_total'],
        ['Utilidad antes de intereses', mdp(antes), 'ventas − costo total', 'visor.antes_intereses'],
        ['Margen antes de financiamiento sobre costo', pct(num(v.rv_margen)), L('Versiones', 'rv_margen'), 'v.rv_margen'],
        ['Costo del dinero', mdp(costoDin), L('Versiones', 'costo_dinero'), 'v.costo_dinero'],
        ['Ganancia real sobre ventas', pct(num(v.margen)), L('Versiones', 'margen'), 'v.margen']
      ] }].concat(hayRenta ? [{ h: 'Si se renta en vez de vender', filas: filasRenta }] : [])
    };
  }

  /* ───────────────────────── 5 · Dinero ───────────────────────── */
  /* Sumas por trimestre (por semestre si el plan pasa de seis años, para que las barras se lean). */
  function trimestres(d, N) {
    var k = N > 72 ? 6 : 3, q = [], n = Math.ceil(N / k), s = function (c, i) { var a = fila(d, c), t = 0; for (var j = 0; j < k; j++) t += a[k * i + j] || 0; return t; };
    for (var i = 0; i < n; i++) q.push({
      de: k * i + 1, a: Math.min(N, k * i + k), cli: s('cobranza', i), ban: s('disposicion', i), cap: s('cap_aporta', i), res: s('respaldo', i),
      obra: s('egresos', i), costob: s('interes', i) + s('apertura', i), pagob: s('pago_banco', i), pagoc: s('pago_capital', i), pagor: s('pago_respaldo', i)
    });
    return q;
  }
  /* El cuadro chico lleva sólo la figura a todo lo ancho, con su clave de colores abajo; el pop-up lleva
     además la columna de totales (entra y sale) a la izquierda. Son las mismas cifras. */
  function cDinero(d) {
    var v = d.v || {}, N = Math.max(1, (d.flujo && d.flujo.meses) || 1), Q = trimestres(d, N);
    var F = fila(d, 'flujo_acum'), capAc = fila(d, 'cap_acum'), salB = fila(d, 'saldo_banco'), salR = fila(d, 'saldo_respaldo'), cajaM = fila(d, 'caja');
    var hayBanco = (total(d, 'disposicion') || 0) > 0.05, hayCap = (total(d, 'cap_aporta') || 0) > 0.05, hayRes = suma(fila(d, 'respaldo')) > 0.05;
    var alBanco = (total(d, 'pago_banco') || 0) + (total(d, 'interes') || 0) + (total(d, 'apertura') || 0);
    var mv = 0, mh = 0, i;
    for (i = 0; i < N; i++) if ((F[i] || 0) < (F[mv] || 0)) mv = i;
    for (i = 0; i < mv; i++) if ((F[i] || 0) > (F[mh] || 0)) mh = i;
    var hoyo = F[mv] || 0, junta = mv > 0 ? (F[mh] || 0) : 0, fin = F[N - 1] || 0, ajeno = num(v.max_ajeno), cajaMin = total(d, 'caja_minima');
    var tasaB = num(dato(d, 'din.tiie')) !== null && num(dato(d, 'din.sobretasa')) !== null ? dato(d, 'din.tiie') + dato(d, 'din.sobretasa') : null;
    var entra = [[CLI, 'clientes', total(d, 'cobranza'), INK, L('Flujo', 'cobranza total'), [
      ['Enganches al firmar', mdp(total(d, 'enganches')), L('Flujo', 'enganches al firmar')], ['Pagos durante la obra', mdp(total(d, 'pagos_obra')), L('Flujo', 'pagos durante la obra')],
      ['Saldos al escriturar', mdp(total(d, 'saldos')), L('Flujo', 'saldos al escriturar')]], 'flujo.cobranza']];
    var sale = [[OBR, 'costos', total(d, 'egresos'), INK, L('Flujo', 'egresos totales'), [
      ['Obra directa', mdp(total(d, 'obra')), L('Flujo', 'obra directa')], ['Indirectos', mdp(total(d, 'indirectos')), L('Flujo', 'indirectos')], ['Imprevistos', mdp(total(d, 'imprevistos')), L('Flujo', 'imprevistos')],
      ['Comisiones de venta', mdp(total(d, 'comisiones')), L('Flujo', 'comisiones')], ['Cierre de tierra', mdp(total(d, 'cierre')), L('Flujo', 'cierre de tierra')]], 'flujo.egresos']];
    if (hayBanco) {
      entra.push([BAN, 'banco', total(d, 'disposicion'), INK, L('Flujo', 'banco: disposición'), [['Crédito dispuesto', mdp(total(d, 'disposicion')), L('Flujo', 'banco: disposición')]], 'flujo.disposicion']);
      sale.push([BAN, 'al banco', alBanco, INK, L('Flujo', 'banco: pago, interés y apertura'), [['Pago del crédito', mdp(total(d, 'pago_banco')), L('Flujo', 'banco: pago')],
        ['Intereses', mdp(total(d, 'interes')), (tasaB !== null ? 'tasa ' + pct(tasaB) + ' · ' : '') + L('Flujo', 'banco: interés')],
        ['Comisión de apertura', mdp(total(d, 'apertura')), (num(dato(d, 'din.apertura')) !== null ? pct(dato(d, 'din.apertura')) + ' · ' : '') + L('Flujo', 'banco: comisión de apertura')]], 'flujo.pago_banco']);
    }
    if (hayCap) {
      entra.push([CAP, 'capital', total(d, 'cap_aporta'), CAPT, L('Flujo', 'capital: aportación'), [['Capital aportado', mdp(total(d, 'cap_aporta')), L('Flujo', 'capital: aportación')]], 'flujo.cap_aporta']);
      sale.push([CAP, 'al capital', total(d, 'pago_capital'), CAPT, L('Flujo', 'capital: pago con su rendimiento'), [['Capital devuelto', mdp(num(v.capital)), L('Versiones', 'capital')],
        ['Rendimiento pagado', mdp(num(v.rend_capital)), (num(dato(d, 'din.tasa_capital')) !== null ? pct(dato(d, 'din.tasa_capital'), 0) + ' anual · ' : '') + L('Versiones', 'rend_capital')]], 'flujo.pago_capital']);
    }
    if (hayRes) {
      entra.push([RES, 'respaldo', suma(fila(d, 'respaldo')), REST, L('Flujo', 'respaldo: lo que faltaría'), [['Dinero que faltaría', mdp(suma(fila(d, 'respaldo'))), L('Flujo', 'respaldo: lo que faltaría')]], 'flujo.respaldo']);
      sale.push([RES, 'al respaldo', total(d, 'pago_respaldo'), REST, L('Flujo', 'respaldo: pago'), [['Pago al respaldo', mdp(total(d, 'pago_respaldo')), L('Flujo', 'respaldo: pago')]], 'flujo.pago_respaldo']);
    }
    var Mayus = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
    var tipItem = function (it) { return T(Mayus(it[1]), it[5].map(function (f) { return [f[0], f[1]]; }).concat(it[5].length > 1 ? [['Total', mdp(it[2])]] : []), it[4], it[6]); };

    /* columnas: entra arriba, sale abajo, por trimestre (o semestre) */
    function columnas(R, AX) {
      var o = [], maxQ = 1;
      Q.forEach(function (t) { maxQ = Math.max(maxQ, t.cli + t.ban + t.cap + t.res, t.obra + t.costob + t.pagob + t.pagoc + t.pagor); });
      var sc = 17 / maxQ;
      Q.forEach(function (t) {
        var w = Math.max(1.5, (t.a - t.de + 1) * R.pm - 1.9), x = R.X(t.de) + 0.95, y = AX - 0.4, cols = '';   // el último trimestre puede ser de uno o dos meses
        [['cli', CLI], ['ban', BAN], ['cap', CAP], ['res', RES]].forEach(function (k) {
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
        o.push('<g' + T('Meses ' + t.de + ' a ' + t.a, f, L('Flujo', N > 72 ? 'suma de seis meses' : 'suma de tres meses')) + '><rect x="' + f1(x - 0.9) + '" y="5" width="' + f1(w + 1.8) + '" height="38" fill="#fffdf9" fill-opacity="0"></rect>' + cols + '</g>');
      });
      o.push('<line x1="' + R.x0 + '" y1="' + AX + '" x2="' + R.x1 + '" y2="' + AX + '" stroke="' + INK + '" stroke-width="0.7"></line>');
      return o;
    }
    /* la clave de colores del cuadro chico, en un renglón: cada color con lo que entra y sale por él */
    function claveColores(fijo) {
      var claves = [[CLI, 'clientes', entra[0]]];
      if (hayBanco) claves.push([BAN, 'banco', null]);
      if (hayCap) claves.push([CAP, 'capital', null]);
      if (hayRes) claves.push([RES, 'respaldo', null]);
      claves.push([OBR, 'costos', sale[0]]);
      var tamC = 7.2, anchos = claves.map(function (c) { return 7 + ancho(c[1], tamC); }), hueco = Math.max(3, Math.min(9, (183 - suma(anchos)) / Math.max(1, claves.length - 1))), xc = 0;
      claves.forEach(function (c, j) {
        var par = c[2] ? [c[2]] : entra.concat(sale).filter(function (it) { return it[0] === c[0]; });
        var filas = []; par.forEach(function (it) { filas.push([Mayus(it[1]), mdp(it[2])]); });
        fijo.push('<g' + (c[2] ? tipItem(c[2]) : T(Mayus(c[1]), filas, par.length ? par[0][4] : L('Flujo'), par.length ? par[0][6] : '')) + '>' + cuadrito(xc, 125.6, c[0], 5) + '<text x="' + f1(xc + 7) + '" y="' + 125.6 + '" font-size="' + tamC + '" fill="' + BODY + '">' + c[1] + '</text></g>');
        xc += anchos[j] + hueco;
      });
    }
    /* la columna de totales de la hoja: entra y sale */
    function columnaTotales(o) {
      var paso = entra.length + sale.length > 6 ? 12.6 : 15, yy = 6.4;
      var item = function (it, y) {
        return '<g' + tipItem(it) + '>' + cuadrito(0, y, it[0]) + '<text x="6.4" y="' + f1(y) + '" font-size="5.8" fill="' + BODY + '">' + it[1] + '</text>' +
          '<text x="6.4" y="' + f1(y + 6.6) + '" font-size="6.4" font-weight="700" fill="' + it[3] + '">' + mdp(it[2]) + '</text></g>';
      };
      o.push('<text x="0" y="' + yy + '" font-size="5.2" font-weight="700" letter-spacing="0.5" fill="' + ORO + '">ENTRA</text>');
      entra.forEach(function (it, j) { o.push(item(it, yy + 8 + j * paso)); });
      yy += 8 + entra.length * paso + 1;
      o.push('<text x="0" y="' + f1(yy) + '" font-size="5.2" font-weight="700" letter-spacing="0.5" fill="' + ORO + '">SALE</text>');
      sale.forEach(function (it, j) { o.push(item(it, yy + 8 + j * paso)); });
    }
    var tipAjeno = function () { return T('Dinero ajeno y caja', [['Máximo de dinero ajeno en uso', mdp(ajeno)], ['Caja mínima exigida', mdp(cajaMin)], ['Costo del dinero', mdp(num(v.costo_dinero))]], Ly(L('Versiones', 'max_ajeno'), 'Flujo V' + d.version + ' · caja mínima' + Lded('Flujo', 'caja mínima')), 'v.max_ajeno'); };

    function figura(grande) {
      var x0 = grande ? 48 : 1, R = grande ? regla(N, x0, 183) : reglaPan(N, x0, 183), fijo = [], AX = 24, yT = 47, yB = grande ? 104 : 96, fs = grande ? 6.6 : 7.6;
      var o = columnas(R, AX);
      /* el valle: saldo acumulado, con el hoyo pintado por quién lo tapa */
      var maxF = Math.max.apply(null, [0].concat(F)), minF = Math.min.apply(null, [0].concat(F));
      var es = (yB - yT) / Math.max(1, maxF - minF), Z = yT + maxF * es, Y = function (x) { return Z - x * es; };
      var V = [[R.x0, 0, 0, 0]];
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
      o.push('<line x1="' + R.x0 + '" y1="' + f1(Z) + '" x2="' + R.x1 + '" y2="' + f1(Z) + '" stroke="#b9b1a1" stroke-width="0.7"></line>');
      o.push('<polyline points="' + V.map(function (p) { return f1(p[0]) + ',' + f1(Y(p[1])); }).join(' ') + '" fill="none" stroke="' + INK + '" stroke-width="1.1" stroke-linejoin="round"></polyline>');
      var franjas = '';
      for (i = 0; i < N; i++) {
        var fm = [['Saldo acumulado', ((F[i] || 0) > 0 ? '+' : '') + mdp(F[i] || 0)]];
        if (hayCap) fm.push(['Capital aportado', mdp(capAc[i] || 0)]);
        if (hayBanco) fm.push(['Saldo del banco', mdp(salB[i] || 0)]);
        if (hayRes) fm.push(['Saldo del respaldo', mdp(salR[i] || 0)]);
        if (cajaM.length) fm.push(['Caja del proyecto', mdp(cajaM[i] || 0)]);
        franjas += '<rect' + T('Mes ' + (i + 1), fm, L('Flujo', 'columna del mes ' + (i + 1)), 'flujo.flujo_acum') + ' x="' + f1(R.X(i + 1)) + '" y="' + (yT - 3) + '" width="' + f1(R.pm) + '" height="' + (yB - yT + 9) + '" fill="#fffdf9" fill-opacity="0"></rect>';
      }
      o.push(franjas);
      var punto = function (m, val, c, tip) { return '<circle' + tip + ' cx="' + f1(R.XE(m)) + '" cy="' + f1(Y(val)) + '" r="' + (grande ? 1.9 : 2.2) + '" fill="' + c + '" stroke="#fffdf9" stroke-width="0.8"></circle>'; };
      var cx0 = R.x0 + 14, cx1 = R.x1 - 32;
      if (junta > 0.05) {
        var tj = T('Lo que junta la preventa', [['Saldo acumulado', '+' + mdp(junta)], ['Mes', mh + 1]], L('Flujo', 'flujo acumulado'), 'flujo.flujo_acum');
        o.push(punto(mh + 1, junta, CLI, tj) + '<text' + tj + ' x="' + f1(clamp(R.XE(mh + 1), cx0, cx1)) + '" y="' + f1(Y(junta) - 4.4) + '" text-anchor="middle" font-size="' + fs + '" font-weight="700" fill="' + CLIT + '">+' + mdp(junta) + '</text>');
      }
      if (hoyo < -0.05) {
        var th = T('Lo más hondo', [['Saldo acumulado', mdp(hoyo)], ['Mes', mv + 1], ['Dinero ajeno en uso, máximo', mdp(ajeno)]], L('Flujo', 'flujo acumulado'), 'flujo.flujo_acum');
        o.push(punto(mv + 1, hoyo, BAD, th) + '<text' + th + ' x="' + f1(clamp(R.XE(mv + 1) - 10, cx0 + 14, cx1)) + '" y="' + f1(Math.min(Y(hoyo) + fs + 2, grande ? yB + fs + 1.4 : 105.6)) + '" text-anchor="middle" font-size="' + fs + '" font-weight="700" fill="' + BADT + '">' + mdp(hoyo) +
          ' <tspan font-weight="400" fill="' + MUTED + '" font-size="' + (fs - 1) + '">· mes ' + (mv + 1) + '</tspan></text>');
      }
      var tf = T('Resultado a repartir', [['Antes de pagar capital y tierra', mdp(num(v.resultado_repartir))], ['Mes', N]], L('Versiones', 'resultado_repartir'), 'v.resultado_repartir');
      o.push(punto(N, fin, fin >= 0 ? CLI : BAD, tf) + '<text' + tf + ' x="' + (R.x1 - 8) + '" y="' + f1(clamp(Y(fin) + fs + 1, yT + 4, yB + 4)) + '" text-anchor="end" font-size="' + fs + '" fill="' + MUTED + '">a repartir <tspan font-weight="700" fill="' + (fin >= 0 ? CLIT : BADT) + '">' + (fin >= 0 ? '+' : '') + mdp(fin) + '</tspan></text>');
      if (grande) {
        columnaTotales(o);
        o.push('<text x="45" y="' + (AX - 2.6) + '" text-anchor="end" font-size="5.2" fill="' + MUTED + '">entra</text><text x="45" y="' + (AX + 6.6) + '" text-anchor="end" font-size="5.2" fill="' + MUTED + '">sale</text>' +
          '<text x="45" y="' + f1(Z - 2) + '" text-anchor="end" font-size="5.2" fill="' + MUTED + '">saldo</text>');
        o.push(ejeMeses(d, N, 116, 123.4, R));
        o.push('<text' + tipAjeno() + ' x="0" y="133" font-size="6.3" fill="' + BODY + '">Dinero ajeno máx. <tspan font-weight="700" fill="' + INK + '">' + mdp(ajeno) + '</tspan>' + (cajaMin ? ' · caja mínima ' + mdp(cajaMin) : '') + '</text>');
      } else {
        claveColores(fijo);
        o.push(ejeMeses(d, N, 108.5, 116, R));
        fijo.push('<text' + tipAjeno() + ' x="0" y="135" font-size="7.6" fill="' + BODY + '">' + (ajeno === null ? '' : 'Dinero ajeno máximo <tspan font-weight="700" fill="' + INK + '">' + mdp(ajeno) + '</tspan>') + '</text>');
      }
      return grande ? o.join('') : panWrap('D', o.join(''), R, 0, 119) + fijo.join('');
    }

    /* Sin saldo acumulado (hay fotos del PPP de siempre que no lo traen): lo que entra y sale por trimestre, como
       siempre, y abajo las series de saldo que sí llegaron (saldo del banco, dinero ajeno en uso, caja del
       proyecto), tal cual. El saldo acumulado no se inventa: el cuadro dice que esta versión no lo trae. */
    var LINEAS = [['saldo_banco', BAN, 'saldo del banco', 'Saldo del banco'], ['ajeno', CAP, 'dinero ajeno', 'Dinero ajeno en uso'], ['caja', CLIT, 'caja', 'Caja del proyecto']]
      .filter(function (l) { return fila(d, l[0]).some(function (x) { return Math.abs(x || 0) > 0.0005; }); }).slice(0, 2);
    function figura2(grande) {
      var x0 = grande ? 48 : 1, R = grande ? regla(N, x0, 183) : reglaPan(N, x0, 183), fijo = [], AX = 24, yT = grande ? 52 : 54, yB = grande ? 104 : 100, fs = grande ? 6.2 : 7.2;
      var o = columnas(R, AX), series = LINEAS.map(function (l) { return { l: l, s: fila(d, l[0]) }; }), max = 0.001, m;
      series.forEach(function (x) { for (m = 0; m < N; m++) max = Math.max(max, x.s[m] || 0); });
      var Y = function (val) { return yB - clamp(val || 0, 0, max) / max * (yB - yT); };
      if (series.length) o.push('<line x1="' + R.x0 + '" y1="' + yB + '" x2="' + R.x1 + '" y2="' + yB + '" stroke="#cfc6b3" stroke-width="0.7"></line>');
      series.forEach(function (x, j) {
        var pts = [];
        for (m = 0; m < N; m++) pts.push(f1(R.XE(m + 1)) + ',' + f1(Y(x.s[m])));
        o.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + x.l[1] + '" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"' + (j ? ' stroke-dasharray="3 2"' : '') + '></polyline>');
        if (j === 0) {
          var mm = 0; for (m = 0; m < N; m++) if ((x.s[m] || 0) > (x.s[mm] || 0)) mm = m;
          var tl = T(mayus1(x.l[2]) + ', lo más alto', [[x.l[3], mdp(x.s[mm] || 0)], ['Mes', mm + 1]], L('Flujo', x.l[3].toLowerCase()));
          o.push('<circle' + tl + ' cx="' + f1(R.XE(mm + 1)) + '" cy="' + f1(Y(x.s[mm])) + '" r="' + (grande ? 1.9 : 2.2) + '" fill="' + x.l[1] + '" stroke="#fffdf9" stroke-width="0.8"></circle>' +
            '<text' + tl + ' x="' + f1(clamp(R.XE(mm + 1), R.x0 + 22, R.x1 - 22)) + '" y="' + f1(Y(x.s[mm]) - 4) + '" text-anchor="middle" font-size="' + fs + '" font-weight="700" fill="' + (x.l[1] === BAN ? INK : x.l[1]) + '">' + mdp(x.s[mm] || 0) + '</text>');
        }
      });
      var franjas = '';
      for (i = 0; i < N; i++) {
        var fm = [['Entra de clientes', mdp(fila(d, 'cobranza')[i] || 0)], ['Sale a costos', mdp(fila(d, 'egresos')[i] || 0)]];
        series.forEach(function (x) { fm.push([x.l[3], mdp(x.s[i] || 0)]); });
        franjas += '<rect' + T('Mes ' + (i + 1), fm, L('Flujo', 'columna del mes ' + (i + 1))) + ' x="' + f1(R.X(i + 1)) + '" y="' + (yT - 3) + '" width="' + f1(R.pm) + '" height="' + (yB - yT + 6) + '" fill="#fffdf9" fill-opacity="0"></rect>';
      }
      o.push(franjas);
      /* rótulo de las líneas, fijo (no se recorre de lado) */
      var rot = '', xr = x0;
      series.forEach(function (x, j) {
        rot += '<line x1="' + f1(xr) + '" y1="' + (yT - 7.6) + '" x2="' + f1(xr + 9) + '" y2="' + (yT - 7.6) + '" stroke="' + x.l[1] + '" stroke-width="1.4"' + (j ? ' stroke-dasharray="3 2"' : '') + '></line>' +
          '<text x="' + f1(xr + 12) + '" y="' + (yT - 5.4) + '" font-size="' + (grande ? 5.6 : 6.8) + '" fill="' + BODY + '">' + x.l[2] + '</text>';
        xr += 12 + ancho(x.l[2], grande ? 5.6 : 6.8) + 8;
      });
      var nota = ajeno !== null ? 'Dinero ajeno máximo <tspan font-weight="700" fill="' + INK + '">' + mdp(ajeno) + '</tspan>' : '<tspan fill="' + MUTED + '">Esta versión no trae el saldo acumulado</tspan>';
      if (grande) {
        columnaTotales(o);
        o.push('<text x="45" y="' + (AX - 2.6) + '" text-anchor="end" font-size="5.2" fill="' + MUTED + '">entra</text><text x="45" y="' + (AX + 6.6) + '" text-anchor="end" font-size="5.2" fill="' + MUTED + '">sale</text>');
        o.push(rot, ejeMeses(d, N, 116, 123.4, R));
        o.push('<text' + tipAjeno() + ' x="0" y="133" font-size="6.3" fill="' + BODY + '">' + nota + '</text>');
        return o.join('');
      }
      claveColores(fijo);
      o.push(ejeMeses(d, N, 108.5, 116, R));
      fijo.push(rot, '<text' + tipAjeno() + ' x="0" y="135" font-size="7.6" fill="' + BODY + '">' + nota + '</text>');
      return panWrap('D', o.join(''), R, 0, 119) + fijo.join('');
    }
    /* Sólo los totales (sin renglones por mes): dos barras, lo que entra y lo que sale, cada parte con su cifra. */
    function figura3() {
      var ent = entra.filter(function (it) { return (it[2] || 0) > 0.05; }), sal = sale.filter(function (it) { return (it[2] || 0) > 0.05; }), o = [];
      var tope = Math.max(0.001, suma(ent.map(function (it) { return it[2]; })), suma(sal.map(function (it) { return it[2]; })));
      [['Entra', ent, 8], ['Sale', sal, 60]].forEach(function (b) {
        var x = 0, lx = 0;
        o.push('<text x="0" y="' + b[2] + '" font-size="7.4" font-weight="700" letter-spacing="0.6" fill="' + MUTED + '">' + b[0].toUpperCase() + '</text>');
        b[1].forEach(function (it) {
          var w = Math.max(1.2, it[2] / tope * 184);
          o.push('<rect' + tipItem(it) + ' x="' + f1(x) + '" y="' + (b[2] + 4) + '" width="' + f1(Math.max(0.6, w - 1)) + '" height="13" rx="2" fill="' + it[0] + '"></rect>');
          x += w;
        });
        b[1].slice(0, 3).forEach(function (it) {
          var txt = it[1] + ' ' + mdp(it[2]);
          o.push('<g' + tipItem(it) + '>' + cuadrito(lx, b[2] + 30, it[0], 4.6) + '<text x="' + f1(lx + 6.5) + '" y="' + (b[2] + 30) + '" font-size="7.2" fill="' + BODY + '">' + it[1] + ' <tspan font-weight="700" fill="' + INK + '">' + mdp(it[2]) + '</tspan></text></g>');
          lx += 12 + ancho(txt, 7.2);
        });
      });
      o.push('<text x="0" y="121" font-size="7.4" fill="' + MUTED + '">Esta versión no trae su flujo mes a mes</text>');
      if (ajeno !== null) o.push('<text' + tipAjeno() + ' x="0" y="133" font-size="7.6" fill="' + BODY + '">Dinero ajeno máximo <tspan font-weight="700" fill="' + INK + '">' + mdp(ajeno) + '</tspan></text>');
      return o.join('');
    }
    var desglose = function (lista) {
      var out = [];
      lista.forEach(function (it) { out.push([Mayus(it[1]), mdp(it[2]), it[4], it[6]]); if (it[5].length > 1) it[5].forEach(function (f) { out.push(['· ' + f[0].toLowerCase(), f[1], f[2]]); }); });
      return out;
    };
    var hayMes = function (c) { return fila(d, c).some(function (x) { return Math.abs(x || 0) > 0.0005; }); };
    var hay = d.flujo && d.flujo.meses && F.length && F.some(function (x) { return Math.abs(x || 0) > 0.0005; });
    var nivel = hay ? 1 : (d.flujo && d.flujo.meses && (hayMes('cobranza') || hayMes('egresos')) ? 2 : ((total(d, 'cobranza') || 0) > 0.05 || (total(d, 'egresos') || 0) > 0.05 ? 3 : 0));
    var vacio = sinDatos(184, 'Aún no hay flujo calculado', ajeno !== null ? 'Dinero ajeno máximo ' + mdp(ajeno) : 'Esta versión todavía no trae su flujo mes a mes.');
    var saldoFilas = hay ? [
      ['Lo que junta la preventa', junta > 0.05 ? '+' + mdp(junta) : '—', 'mes ' + (mh + 1) + ' · ' + L('Flujo', 'flujo acumulado'), 'flujo.flujo_acum'],
      ['Lo más hondo', mdp(hoyo), 'mes ' + (mv + 1) + ' · ' + L('Flujo', 'flujo acumulado'), 'flujo.flujo_acum']
    ] : [['Saldo acumulado', 'sin dato', 'Esta versión no trae el flujo acumulado mes a mes']];
    return {
      id: 'dinero', n: 5, titulo: 'Dinero', sub: nivel === 1 ? 'entra, sale y saldo' : (nivel ? 'entra y sale' : ''), w: 184, wG: 184, hG: 136,
      svg: nivel === 1 ? figura(false) : nivel === 2 ? figura2(false) : nivel === 3 ? figura3() : vacio,
      svgG: nivel === 1 ? figura(true) : nivel === 2 ? figura2(true) : nivel === 3 ? figura3() : vacio,
      aria: nivel === 1 ? 'Dinero: lo más hondo ' + mdp(hoyo) + ' en el mes ' + (mv + 1) + ', dinero ajeno máximo ' + mdp(ajeno) + ', a repartir ' + mdp(fin)
        : 'Dinero: entra ' + mdp(total(d, 'cobranza')) + ' de clientes y sale ' + mdp(total(d, 'egresos')) + ' a costos; esta versión no trae el saldo acumulado',
      detalle: [{ h: 'Entra (MDP)', filas: desglose(entra) }, { h: 'Sale (MDP)', filas: desglose(sale) }, { h: 'Saldo y dinero ajeno', filas: saldoFilas.concat([
        ['Resultado a repartir', mdp(num(v.resultado_repartir)), L('Versiones', 'resultado_repartir'), 'v.resultado_repartir'],
        ['Dinero ajeno en uso, máximo', mdp(ajeno), L('Versiones', 'max_ajeno'), 'v.max_ajeno'],
        ['Crédito del banco, saldo máximo', mdp(num(v.banco_max)), L('Versiones', 'banco_max'), 'v.banco_max'],
        ['Capital aportado', mdp(num(v.capital)), L('Versiones', 'capital'), 'v.capital'],
        ['Caja mínima exigida', mdp(cajaMin), L('Flujo', 'caja mínima'), 'flujo.caja_minima'],
        ['Caja al cierre', mdp(num(v.caja_cierre)), L('Versiones', 'caja_cierre'), 'v.caja_cierre'],
        ['Costo del dinero', mdp(num(v.costo_dinero)), L('Versiones', 'costo_dinero'), 'v.costo_dinero']
      ]) }]
    };
  }

  /* ───────────────────────── 6 · Reparto (cuadro doble) ───────────────────────── */
  function cReparto(d) {
    var v = d.v || {}, rp = d.reparto || {}, o = [], X0 = 96, RC = repartoT10(d);
    var pone = num(v.dueno_aporta) || 0, recibe = num(v.dueno_recibe) || 0, capital = num(v.capital) || 0, capRecibe = total(d, 'pago_capital') || (capital + (num(v.rend_capital) || 0));
    var alianza = num(v.alianza_recibe) || 0, sc = Math.min(1.7, 186 / Math.max(1, pone, recibe, capital, capRecibe, alianza));
    var rows = [['Dueño', v.pago_especie ? 'anticipo + viviendas' : 'pone su terreno', TIE, ORO, pone, 'pone ' + mdp(pone), recibe, recibeT10(RC, 'dueno_recibe', recibe, 'recibe ' + mdp(recibe)), num(v.dueno_veces) ? '×' + v.dueno_veces.toFixed(2) : '',
      T('Dueño del terreno', [['Aporta su tierra', mdp(pone)], [RC && recibe < 0 ? 'Pérdida asignada (teórica)' : 'Recibe en total' + (RC && !publicaT10(RC, 'dueno_recibe') ? ' (teórico)' : ''), mdp(recibe)], ['Veces el valor de su tierra', num(v.dueno_veces) ? v.dueno_veces.toFixed(2) + '×' : '—']].concat(RC
        ? [['Estado del reparto', RC.estado], ['Fecha', fechaT10(RC)]] : [['Recibe lo último en el mes', num(v.dueno_meses) || '—']]), L('Versiones', 'dueno_aporta, dueno_recibe y dueno_veces'), 'v.dueno_recibe')]];
    if (capital > 0.05) rows.push(['Capital', 'pone efectivo', CAP, CAPT, capital, 'pone ' + mdp(capital), capRecibe, 'recibe ' + mdp(capRecibe), '×' + (capRecibe / capital).toFixed(2),
      T('Capital', [['Aporta', mdp(capital)], ['Recibe con su rendimiento', mdp(capRecibe)], ['Rendimiento', mdp(num(v.rend_capital))], ['Tasa anual', pct(num(rp.tasa_capital), 0)], ['Liquidado en el mes', num(v.capital_mes) || '—']], Ly(L('Versiones', 'capital y rend_capital'), 'Flujo V' + d.version + ' · capital: pago' + Lded('Flujo', 'capital: pago')), 'flujo.pago_capital')]);
    rows.push(['Alianza', 'pone trabajo y gestión', CLI, CLIT, 0, 'sin dinero propio', alianza, recibeT10(RC, 'alianza_recibe', alianza, 'recibe ' + mdp(alianza) + ' de utilidad'), '',
      T('Alianza desarrolladora', [['Recibe', mdp(alianza)], ['Su parte de la utilidad', pct(num(rp.parte_alianza), 0)]], L('Versiones', 'alianza_recibe'), 'v.alianza_recibe')]);
    var paso = rows.length === 3 ? 39 : 52;
    rows.forEach(function (r, i) {
      var y = 4 + i * paso;
      o.push('<g' + r[9] + '><text x="0" y="' + (y + 13) + '" font-size="10" font-weight="700" fill="' + r[3] + '">' + r[0] + '</text><text x="0" y="' + (y + 24) + '" font-size="7.6" fill="' + BODY + '">' + r[1] + '</text>');
      if (r[4] > 0.05) o.push('<rect x="' + X0 + '" y="' + (y + 4) + '" width="' + f1(r[4] * sc) + '" height="9" rx="2" fill="' + r[2] + '" fill-opacity="0.32"></rect><text x="' + f1(X0 + r[4] * sc + 5) + '" y="' + (y + 11.6) + '" font-size="7.6" fill="' + BODY + '">' + r[5] + '</text>');
      else o.push('<rect x="' + X0 + '" y="' + (y + 4) + '" width="16" height="9" rx="2" fill="none" stroke="' + r[2] + '" stroke-width="0.8" stroke-dasharray="2 1.5"></rect><text x="' + (X0 + 21) + '" y="' + (y + 11.6) + '" font-size="7.6" fill="' + BODY + '">' + r[5] + '</text>');
      o.push('<rect x="' + X0 + '" y="' + (y + 17) + '" width="' + f1(Math.max(0, r[6]) * sc) + '" height="12" fill="' + r[2] + '"></rect><text x="' + f1(X0 + Math.max(0, r[6]) * sc + 5) + '" y="' + (y + 26.8) + '" font-size="8.4" font-weight="700" fill="' + INK + '">' + r[7] + '</text>');
      if (r[8]) o.push('<text x="396" y="' + (y + 26) + '" text-anchor="end" font-size="19" font-weight="700" fill="' + r[3] + '">' + r[8] + '</text>');
      o.push('</g>');
    });
    o.push('<text x="396" y="10" text-anchor="end" font-size="7.4" fill="' + MUTED + '">veces lo que puso</text>');
    var orden = [];
    if ((total(d, 'disposicion') || 0) > 0.05) orden.push('banco');
    if (capital > 0.05) orden.push('capital');
    if (rp.paga_tierra) orden.push('terreno');
    var pd = num(rp.parte_dueno), pa = num(rp.parte_alianza), pc = num(rp.parte_capital) || 0;
    orden.push(pd !== null ? (pd === pa && !pc ? 'utilidad mitad y mitad' : 'utilidad ' + pct(pd, 0) + ' dueño · ' + pct(pa, 0) + ' alianza' + (pc ? ' · ' + pct(pc, 0) + ' capital' : '')) : 'utilidad');
    o.push('<text' + T('Esquema de reparto', [['Esquema', rp.esquema || (d.plan && d.plan.esquema) || '—'], ['Parte del dueño', pct(pd, 0)], ['Parte de la alianza', pct(pa, 0)], ['Parte del capital', pct(pc, 0)], ['¿Se paga la tierra antes de repartir?', rp.paga_tierra ? 'sí' : 'no']], L('Reparto'), 'reparto.esquema') +
      ' x="0" y="132" font-size="7.6" fill="' + MUTED + '">Orden de cobro: ' + orden.join(' → ') + (!RC && num(v.dueno_meses) ? ' · el dueño cobra en el mes ' + v.dueno_meses : '') + '</text>');
    if (RC && (RC.bloqueado || !RC.autorizable)) o.push('<text x="0" y="10" font-size="7.4" font-weight="700" fill="' + BADT + '">' + esc(corta('Reparto ' + (RC.bloqueado ? RC.estado : 'teórico, sin autorización de pago'), 60)) + '</text>');
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
      (!RC && num(v.dueno_meses) ? '<text x="0" y="' + (yo + 9.5) + '" font-size="6.6" fill="' + MUTED + '">El dueño cobra en el mes ' + v.dueno_meses + '</text>' : ''));
    return {
      pieFecha: RC ? mayus1(fechaT10(RC)) : '',
      id: 'reparto', n: 6, titulo: 'Reparto', sub: esc(corta((RC ? (RC.bloqueado ? 'bloqueado · ' : !RC.autorizable ? 'teórico · ' : '') : '') + (rp.esquema || (d.plan && d.plan.esquema) || 'pones y recibes'), 44)), svg: pone || recibe || alianza ? o.join('') : sinDatos(396, 'Aún no hay reparto calculado', 'Cuando el plan tenga su esquema, aquí se verá quién pone y quién recibe.'), w: 396, doble: true,
      svgG: pone || recibe || alianza ? g.join('') : sinDatos(220, 'Aún no hay reparto calculado'), wG: 220, hG: pone || recibe || alianza ? yo + 13 : 136,
      aria: RC ? 'Reparto (' + RC.estado + '): el dueño pone ' + mdp(pone) + (recibe < 0 ? ' y tiene una pérdida asignada teórica de ' + mdp(recibe) : ' y recibe ' + mdp(recibe) + (publicaT10(RC, 'dueno_recibe') ? '' : ' (teórico)')) + '; la alianza ' + (alianza < 0 ? 'tiene una pérdida asignada teórica de ' + mdp(alianza) : 'recibe ' + mdp(alianza) + (publicaT10(RC, 'alianza_recibe') ? '' : ' (teórico)')) + '; ' + fechaT10(RC)
        : 'Reparto: el dueño pone ' + mdp(pone) + ' y recibe ' + mdp(recibe) + '; la alianza recibe ' + mdp(alianza),
      detalle: [{ h: 'Quién pone y quién recibe (MDP)', filas: [
        ['Dueño · aporta su tierra', mdp(pone), L('Versiones', 'dueno_aporta'), 'v.dueno_aporta'], [RC && recibe < 0 ? 'Dueño · pérdida asignada (teórica)' : 'Dueño · recibe en total' + (RC && !publicaT10(RC, 'dueno_recibe') ? ' (teórico)' : ''), mdp(recibe), L('Versiones', 'dueno_recibe'), 'v.dueno_recibe'],
        ['Dueño · veces su tierra', num(v.dueno_veces) ? v.dueno_veces.toFixed(2) + '×' : '—', L('Versiones', 'dueno_veces'), 'v.dueno_veces'],
        ['Capital · aporta', mdp(capital), L('Versiones', 'capital'), 'v.capital'], ['Capital · recibe con rendimiento', mdp(capRecibe), L('Flujo', 'capital: pago'), 'flujo.pago_capital'],
        [RC && alianza < 0 ? 'Alianza · pérdida asignada (teórica)' : 'Alianza · recibe' + (RC && !publicaT10(RC, 'alianza_recibe') ? ' (teórico)' : ''), mdp(alianza), L('Versiones', 'alianza_recibe'), 'v.alianza_recibe'], ['Resultado a repartir', mdp(num(v.resultado_repartir)), L('Versiones', 'resultado_repartir'), 'v.resultado_repartir']
      ].concat(v.pago_especie ? [
        ['Anticipo incluido en el pago total', mdp(num(v.pago_anticipo)), L('Versiones', 'pago_anticipo'), 'v.pago_anticipo'],
        ['Resto en viviendas, sin cobro de terceros', mdp(num(v.pago_vivienda)), L('Versiones', 'pago_vivienda'), 'v.pago_vivienda'],
        ['Resultado neto del desarrollador; puede perder capital', mdp(num(v.pago_resultado)), L('Versiones', 'pago_resultado'), 'v.pago_resultado']
      ] : []) }, { h: 'Esquema', filas: [
        [rp.esquema || (d.plan && d.plan.esquema) || '—', '', L('Reparto', 'esquema elegido'), 'reparto.esquema'],
        ['Utilidad para el dueño', pct(pd, 0), L('Reparto')], ['Utilidad para la alianza', pct(pa, 0), L('Reparto')],
        ['Tasa anual del capital antes de repartir', pct(num(rp.tasa_capital), 0), L('Reparto')]
      ].concat(RC ? [['Hito del motor (referencia del Árbol)', RC.hito ? 'mes ' + RC.hito : '—', L('Versiones', 'mes_reparto'), 'v.mes_reparto'], ['Corte autorizado', RC.corte ? 'mes ' + RC.corte : 'sin fecha autorizada', 'Reparto · ' + RC.estado, 'cascada.fechas']]
        : [['Mes del reparto', num(v.mes_reparto) || '—', L('Versiones', 'mes_reparto'), 'v.mes_reparto']]) }].concat(RC ? [{ h: 'Estado del reparto (copia de prueba del Árbol)', filas: [['Estado', RC.estado, 'Árbol PPP · módulo de repartos', 'cascada.estado'], ['Fecha', fechaT10(RC), 'Árbol PPP · módulo de repartos', 'cascada.fechas']]
        .concat(RC.motivos.map(function (m, i) { return ['Motivo ' + (i + 1), corta(m, 160), 'Árbol PPP · módulo de repartos', 'cascada.motivos']; })) }] : [])
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
  /* El mismo límite, dicho en una frase (para el renglón que se abre): «50% o menos», «1.3 veces o más», «$0». Es la
     regla de la revisión para fondos del libro, no la política de un banco. */
  function pideTexto(p) {
    if (p.modo === 'cero') return '$0';
    var x = p.u === '%' ? Math.round(p.lim * 100) + '%' : (p.u === '×' ? p.lim + ' veces' : p.lim + ' ' + p.u);
    return x + (p.modo === 'max' ? ' o menos' : ' o más') + (p.ideal ? ', y considera sano ' + Math.round(p.ideal * 100) + '%' : '');
  }
  function hoyPrueba(p, valor, h, st) {
    if (st === 'na') return 'El plan: ' + (valor === '—' ? 'sin dato' : valor) + ' · esta prueba no aplica a esta versión.';
    return 'El plan: ' + valor + ' · la revisión para fondos pide ' + pideTexto(p) + ' · ' + (st === 'justa' ? 'pasa, pero abajo de lo sano' : h[0]) + '.';
  }
  function holguraPrueba(p, x, st) {
    if (st === 'na') return ['no aplica', MUTED];
    if (p.modo === 'cero') return st === 'ok' ? ['no falta', CLIT] : ['falta ' + mdp(x), BADT];
    if (st === 'justa') return ['justa · lo sano es ' + Math.round(p.ideal * 100) + '%', AMBT];
    var dif = Math.abs(p.modo === 'max' ? p.lim - x : x - p.lim), t = p.u === '%' ? (dif * 100).toFixed(1) + ' pts' : (p.u === '×' ? dif.toFixed(2) + '×' : Math.round(dif) + ' meses');
    return st === 'ok' ? ['sobran ' + t, CLIT] : ['faltan ' + t, BADT];
  }
  function anillo(p, x, cx, cy, r, grande) {
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
      if (grande) o += '<text x="' + f1(izq[0] - 3.3) + '" y="' + f1(izq[1] + 1.8) + '" text-anchor="end" font-size="5" fill="' + (enLo ? BADT : MUTED) + '"' + (enLo ? ' font-weight="700"' : '') + '>' + fmt(lo) + '</text>' +
        '<text x="' + f1(der[0] + 3.3) + '" y="' + f1(der[1] + 1.8) + '" font-size="5" fill="' + (enLo ? MUTED : BADT) + '"' + (enLo ? '' : ' font-weight="700"') + '>' + fmt(hi) + '</text>';
    }
    var txt = valorPrueba(p, x), size = grande ? 7.2 : 7.8;
    while (size > 6 && ancho(txt, size, true) > 2 * (r - sw / 2) - 1) size = Math.round((size - 0.2) * 10) / 10;
    o += '<text x="' + f1(cx) + '" y="' + f1(cy + size * 0.36) + '" text-anchor="middle" font-size="' + size + '" font-weight="700" fill="' + tinta + '">' + txt + '</text>';
    return { svg: o, st: st };
  }
  /* En el cuadro chico, la holgura va corta; en el pop-up, completa y con los extremos de cada escala. */
  function holguraCorta(h, st) { return st === 'justa' ? ['justa', h[1]] : h; }
  function cRiesgo(d) {
    var v = d.v || {}, cuenta = { ok: 0, justa: 0, fuera: 0, na: 0 }, det = [];
    var pr = d.pruebas || [], golpes = pr.filter(function (x) { return !/^base\b|sin cambio/i.test(x.escenario || ''); });
    var aguanta = golpes.filter(function (x) { return (x.respaldo || 0) < 0.01 && (x.ganancia || 0) > 0; }).length;
    var edad = String((d.plan && d.plan.edad) || ''), ie = EDADES.indexOf(edad), cand = num(d.plan && d.plan.candados_abiertos), abiertos = (d.candados || []).filter(function (c) { return /abierto|revisi/.test(c.estado); });
    var paso = (d.plan && d.plan.paso_texto) || '';
    var tipEstres = T('Pruebas de estrés', golpes.length ? golpes.slice(0, 12).map(function (x) { return [x.escenario, (x.respaldo || 0) > 0.01 ? 'falta ' + mdp(x.respaldo) : 'gana ' + mdp(x.ganancia)]; }) : [['Sin pruebas de esta versión', 'hay que correrlas']], L('Pruebas'), 'estres');
    /* la etapa y los candados van en el mismo renglón, pero cada uno con su leyenda (y su texto: qué es, de qué depende) */
    var tipEtapa = T('Etapa del plan', [['Etapa', edad || '—']].concat(ie >= 0 ? [['De cinco', (ie + 1) + ' de 5']] : []), L('Plan', 'plan.edad'), 'plan.edad');
    var tipCand = T('Candados abiertos', [['Abiertos o en revisión', cand === null ? '—' : String(cand)]].concat(abiertos.slice(0, 8).map(function (c) { return ['· ' + c.candado, c.estado]; })), L('Candados'), 'plan.candados_abiertos');
    var candTxt = cand !== null ? ' · <tspan' + tipCand + ' font-weight="700" fill="' + (cand > 0 ? BADT : CLIT) + '">' + (cand > 0 ? cand + (cand === 1 ? ' candado abierto' : ' candados abiertos') : 'sin candados abiertos') + '</tspan>' : '';
    function figura(grande) {
      var o = [], COL = [0, 62, 124], FIL = [0, 36.5, 73];
      PRUEBAS.forEach(function (p, i) {
        var x = num(v[p.k]), cx = COL[i % 3] + 30, y0 = FIL[Math.floor(i / 3)], a = anillo(p, x, cx, y0 + (grande ? 12 : 11.4), grande ? 10.4 : 10.6, grande), h = holguraPrueba(p, x, a.st);
        var valor = x === null ? (typeof v[p.k] === 'string' && v[p.k] ? v[p.k] : '—') : (p.u === '%' ? pct(x) : valorPrueba(p, x) + (p.u === 'meses' ? ' meses' : ''));
        if (grande) {
          cuenta[a.st]++;
          det.push([p.largo, valor, limitePrueba(p) + ' · ' + holguraCorta(h, a.st)[0] + ' · ' + L('Versiones', p.k), 'v.' + p.k, hoyPrueba(p, valor, h, a.st)]);
        }
        var hc = grande ? h : holguraCorta(h, a.st);
        var linea = grande && p.modo === 'cero' && a.st === 'ok' ? '<tspan fill="' + MUTED + '">debe ser $0 · </tspan><tspan fill="' + hc[1] + '" font-weight="700">' + hc[0] + '</tspan>' : '<tspan fill="' + hc[1] + '" font-weight="700">' + hc[0] + '</tspan>';
        o.push('<g' + T(p.largo, [['El plan', valor], ['La revisión pide', limitePrueba(p)], ['Holgura', holguraCorta(h, a.st)[0]]], L('Versiones', p.k), 'v.' + p.k) + '><rect x="' + COL[i % 3] + '" y="' + y0 + '" width="60" height="35" fill="#fffdf9" fill-opacity="0"></rect>' + a.svg +
          (grande ? '<text x="' + cx + '" y="' + f1(y0 + 28.2) + '" text-anchor="middle" font-size="5.4" fill="' + BODY + '">' + p.nombre + '</text><text x="' + cx + '" y="' + f1(y0 + 34.4) + '" text-anchor="middle" font-size="5.1">' + linea + '</text>'
            : '<text x="' + cx + '" y="' + f1(y0 + 27.6) + '" text-anchor="middle" font-size="6.8" fill="' + BODY + '">' + p.corto + '</text><text x="' + cx + '" y="' + f1(y0 + 35) + '" text-anchor="middle" font-size="6.3">' + linea + '</text>') + '</g>');
      });
      o.push('<line x1="0" y1="110.6" x2="184" y2="110.6" stroke="#ece6da" stroke-width="0.7"></line>');
      if (grande) {
        o.push('<text' + tipEstres + ' x="0" y="117.6" font-size="5.6" fill="' + BODY + '"><tspan font-weight="700" fill="' + ORO + '">Aguante</tspan> ' + (golpes.length ? 'aguanta <tspan font-weight="700" fill="' + INK + '">' + aguanta + ' de ' + golpes.length + '</tspan> golpes de las pruebas de estrés'
          : 'pruebas de estrés por repetir' + (d.pruebas_viejas ? ': el plan cambió' : '')) + '</text>');
        o.push('<text x="0" y="126.2" font-size="5.8" fill="' + INK + '"><tspan' + tipEtapa + '>Etapa <tspan font-weight="700" fill="' + CLIT + '">' + esc(edad || '—') + '</tspan>' + (ie >= 0 ? ' (' + (ie + 1) + ' de 5)' : '') + '</tspan>' + candTxt + '</text>');
        if (paso) o.push('<text' + T('Siguiente paso', [[paso, '']], L('Plan', 'plan.paso_texto'), 'plan.paso_texto') + ' x="0" y="134.4" font-size="5.6" fill="' + MUTED + '">Siguiente paso: ' + esc(corta(paso, 50)) + '</text>');
      } else {
        o.push('<text' + tipEstres + ' x="0" y="121" font-size="7.4" fill="' + BODY + '">' + (golpes.length ? 'Estrés: aguanta <tspan font-weight="700" fill="' + INK + '">' + aguanta + ' de ' + golpes.length + '</tspan> golpes'
          : 'Estrés: <tspan font-weight="700" fill="' + INK + '">por repetir</tspan>' + (d.pruebas_viejas ? ' (el plan cambió)' : '')) + '</text>');
        o.push('<text x="0" y="132" font-size="7.4" fill="' + INK + '"><tspan' + tipEtapa + '>Etapa <tspan font-weight="700" fill="' + CLIT + '">' + esc(edad || '—') + '</tspan>' + (ie >= 0 ? ' ' + (ie + 1) + '/5' : '') + '</tspan>' + candTxt + '</text>');
      }
      return o.join('');
    }
    /* Sin ninguna prueba de la revisión para fondos (un plan del PPP de siempre, por ejemplo) no se dibujan
       anillos vacíos: se dice que el plan no tiene esa revisión, y lo que sí haya del estado. */
    var hayRevision = PRUEBAS.some(function (p) { return num(v[p.k]) !== null; });
    if (!hayRevision) {
      var hayEstado = !!edad || cand !== null || abiertos.length > 0;
      var vac = ['<g' + T('Revisión para fondos', [['Pruebas del banco', 'sin calcular']], L('Versiones', 'rv_resultado')) + '>' +
        '<circle cx="92" cy="' + (hayEstado || golpes.length ? 34 : 44) + '" r="15" fill="#f3eee4"></circle>' +
        '<path transform="translate(' + 82 + ' ' + ((hayEstado || golpes.length ? 34 : 44) - 11) + ')" d="M10 1.5 L18 4.5 V10.5 C18 15.5 14.6 19 10 20.5 C5.4 19 2 15.5 2 10.5 V4.5 Z" fill="none" stroke="' + ORO + '" stroke-width="1.5" stroke-linejoin="round"></path>' +
        '<text x="92" y="' + (hayEstado || golpes.length ? 64 : 76) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + INK + '">Sin revisión para fondos</text>' +
        '<text x="92" y="' + (hayEstado || golpes.length ? 76 : 88) + '" text-anchor="middle" font-size="7.6" fill="' + MUTED + '">El plan todavía no tiene las nueve</text>' +
        '<text x="92" y="' + (hayEstado || golpes.length ? 86 : 98) + '" text-anchor="middle" font-size="7.6" fill="' + MUTED + '">pruebas que pide el banco.</text></g>'];
      if (golpes.length) vac.push('<text' + tipEstres + ' x="0" y="121" font-size="7.4" fill="' + BODY + '">Estrés: aguanta <tspan font-weight="700" fill="' + INK + '">' + aguanta + ' de ' + golpes.length + '</tspan> golpes</text>');
      if (hayEstado) vac.push('<text x="0" y="132" font-size="7.4" fill="' + INK + '">' + (edad ? '<tspan' + tipEtapa + '>Etapa <tspan font-weight="700" fill="' + CLIT + '">' + esc(edad) + '</tspan>' + (ie >= 0 ? ' ' + (ie + 1) + '/5' : '') + '</tspan>' : '') + (edad ? candTxt : candTxt.replace(/^ · /, '')) + '</text>');
      var filasEstado = [];
      if (edad) filasEstado.push(['Etapa', edad, ie >= 0 ? (ie + 1) + ' de 5 · ' + L('Plan', 'plan.edad') : L('Plan', 'plan.edad'), 'plan.edad']);
      if (cand !== null) filasEstado.push(['Candados abiertos', String(cand), L('Plan', 'plan.candados_abiertos'), 'plan.candados_abiertos']);
      if (paso) filasEstado.push(['Siguiente paso', '', paso, 'plan.paso_texto']);
      (d.candados || []).forEach(function (c) { filasEstado.push(['Candado · ' + c.candado, c.estado, L('Candados')]); });
      return {
        id: 'riesgo', n: 7, titulo: 'Riesgo y estado', sub: '', svg: vac.join(''), w: 184,
        aria: 'Riesgo y estado: sin revisión para fondos' + (edad ? '; etapa ' + edad : ''),
        detalle: [{ h: 'Revisión para fondos', filas: [['Sin revisión para fondos', '', 'El plan todavía no tiene calculadas las nueve pruebas que pide el banco.']] }]
          .concat(golpes.length ? [{ h: 'Pruebas de estrés', filas: golpes.map(function (x) { return [x.escenario, (x.respaldo || 0) > 0.01 ? 'falta ' + mdp(x.respaldo) : 'gana ' + mdp(x.ganancia), (x.cambia || '') + (x.fecha ? ' · ' + fechaCorta(x.fecha) : '')]; }) }] : [])
          .concat(filasEstado.length ? [{ h: 'Estado del plan', filas: filasEstado }] : [])
      };
    }
    var svgG = figura(true), svg = figura(false);
    var res = String(v.rv_resultado || ''), pasa = /^pasa/i.test(res), nf = (/(\d+)\s+de\s+(\d+)/.exec(res) || [])[1];
    var sub = !res ? '' : (pasa ? '<b style="color:' + CLIT + '">Pasa</b>' + (cuenta.justa ? ' · ' + cuenta.justa + ' justa' + (cuenta.justa > 1 ? 's' : '') : '')
      : (/^no pasa/i.test(res) ? '<b style="color:' + BADT + '">No pasa</b>' + (nf ? ' · ' + nf + ' de 9' : '') : esc(corta(res, 24))));
    return {
      id: 'riesgo', n: 7, titulo: 'Riesgo y estado', sub: sub, svg: svg, w: 184, svgG: svgG, wG: 184, hG: 136,
      aria: 'Riesgo y estado: revisión para fondos, ' + res + '; etapa ' + edad + '; ' + (cand === null ? '' : cand + ' candados abiertos'),
      detalle: [{ h: 'Revisión para fondos · ' + (res || 'sin calcular'), filas: det }, {
        h: 'Pruebas de estrés' + (golpes.length ? '' : ' · por repetir'),
        filas: golpes.length ? [['Aguante', 'aguanta ' + aguanta + ' de ' + golpes.length, 'golpes en los que no falta dinero y la ganancia sigue arriba de cero', 'estres']].concat(golpes.map(function (x) { return [x.escenario, (x.respaldo || 0) > 0.01 ? 'falta ' + mdp(x.respaldo) : 'gana ' + mdp(x.ganancia), (x.cambia || '') + (x.fecha ? ' · ' + fechaCorta(x.fecha) : '')]; }))
          : [['No hay pruebas con las cifras de hoy', '', d.pruebas_viejas ? 'Las ' + d.pruebas_viejas + ' que hay son de cifras anteriores' : L('Pruebas'), 'estres']]
      }, { h: 'Estado del plan', filas: [['Etapa', edad || '—', ie >= 0 ? (ie + 1) + ' de 5 · ' + L('Plan', 'plan.edad') : L('Plan', 'plan.edad'), 'plan.edad']]
        .concat(cand !== null ? [['Candados abiertos', String(cand), L('Plan', 'plan.candados_abiertos'), 'plan.candados_abiertos']] : [])
        .concat([['Siguiente paso', '', paso || '—', 'plan.paso_texto']])
        .concat((d.candados || []).map(function (c) { return ['Candado · ' + c.candado, c.estado, L('Candados')]; })) }]
    };
  }

  /* ───────────────────────── la pantalla ───────────────────────── */
  function cuadros(d) {
    ACTUAL = d;
    VER = d.version || 0; ORIGEN = typeof d.origen === 'string' ? d.origen.trim().slice(0, 120) : '';
    DED = d.deducido && typeof d.deducido === 'object' && !Array.isArray(d.deducido) && Object.keys(d.deducido).length ? d.deducido : null;
    return [cReparto(d), cTerreno(d), cProducto(d), cTiempo(d), cCosto(d), cDinero(d), cRiesgo(d)];
  }
  /* El origen de una cifra, con su nota «deducido de …» aparte: en la leyenda va abierta; en la hoja, tras un chip. */
  var ICONO_DED = '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"></circle><path d="M5.2 6.6h5.6M5.2 9.6h5.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path></svg>';
  function origenTip(o) { var p = partesOrigen(o); return (p.base ? '<small>' + esc(p.base) + '</small>' : '') + (p.ded ? '<small class="vz-tip-ded">' + ICONO_DED + '<span>' + esc(mayus1(p.ded)) + '</span></small>' : ''); }
  function origenFila(o) {
    var p = partesOrigen(o);
    if (!p.ded) return p.base ? '<small>' + esc(p.base) + '</small>' : '';
    return '<small>' + (p.base ? esc(p.base) + ' ' : '') + '<button type="button" class="vz-ded" aria-expanded="false">' + ICONO_DED + 'deducido</button></small><small class="vz-ded-txt" hidden>' + esc(mayus1(p.ded)) + '</small>';
  }
  function svgDe(c, grande) {
    if (grande) return '<svg viewBox="0 0 ' + (c.wG || c.w) + ' ' + (c.hG || 136) + '" class="vz-svg-g" role="img" aria-label="' + esc(c.aria) + '">' + (c.svgG || c.svg) + '</svg>';
    return '<svg viewBox="0 0 ' + c.w + ' 136" width="' + c.w + '" height="136" role="img" aria-label="' + esc(c.aria) + '"' + (/class="vz-pan"/.test(c.svg) ? ' class="vz-panea"' : '') + '>' + c.svg + '</svg>';
  }
  function pieFecha(c) {
    return c.pieFecha ? '<p class="vz-fecha-reparto">' + esc(c.pieFecha) + '</p>' : '';
  }
  function tarjeta(c) {
    return '<section class="vz-card' + (c.doble ? ' vz-doble' : '') + '" data-card="' + c.id + '" tabindex="0" role="button" aria-haspopup="dialog" aria-label="' + esc(c.titulo + ': ver el detalle') + '">' +
      '<div class="vz-head"><span class="vz-tit">' + esc(c.titulo) + '</span><span class="vz-sub">' + c.sub + '</span></div>' + svgDe(c, false) + pieFecha(c) + '</section>';
  }
  function encabezado(d) {
    var v = d.v || {}, est = String(v.estado || ''), fa = fechaCorta(v.fecha_aprobacion), cambio = fechaCorta(d.cambio);
    return '<header class="vz-top"><div class="vz-l1"><span class="vz-marca">YoDesarrollo · Plan de Potencial</span>' +
      '<span class="vz-vivo" id="vzVivo" data-base="' + esc('En vivo' + (cambio ? ' · cambió ' + cambio : '')) + '"><i aria-hidden="true"></i><span>En vivo' + (cambio ? ' · cambió ' + esc(cambio) : '') + '</span></span></div>' +
      '<div class="vz-l2"><h1>' + esc((d.plan && d.plan.nombre) || 'Plan de Potencial') + '</h1><span class="vz-ver">V' + esc(d.version) + (est ? ' ' + esc(est) : '') + (est === 'vigente' && fa ? ' · ' + fa : '') + '</span></div>' + entradaEditor(d) + '</header>';
  }
  /* Sólo navegación: el destino valida la sesión y el permiso de edición con el Portero. */
  function entradaEditor(d) {
    var id = d.menu && d.menu.plan, href = '', etiqueta = 'Editar factores';
    if (/^p2[a-z0-9]{6,20}$/.test(id || '')) href = 'ppp2.html#/plan/' + encodeURIComponent(id) + '/editar' + (/^[123]$/.test(String(d.version)) ? '/' + d.version : '');
    else if (/^ppp:[A-Za-z0-9_-]{3,64}(?::[A-Za-z0-9_-]{1,40})?$/.test(id || '')) { href = 'index.html'; etiqueta = 'Abrir editor del PPP'; }
    return href ? '<p class="vz-editor"><a href="' + esc(href) + '">' + etiqueta + ' →</a><small>Acceso del equipo</small></p>' : '';
  }
  function selector(d) {
    var planes = (d.menu && d.menu.planes) || [], vers = d.versiones || [], o = '';
    if (planes.length > 1) o += '<div class="vz-chips" role="group" aria-label="Terrenos">' + planes.map(function (p) {
      return '<button type="button" class="vz-chip' + (p.id === d.menu.plan ? ' vz-on' : '') + '" data-plan="' + esc(p.id) + '">' + esc(corta(p.etiqueta, 22)) + '</button>';
    }).join('') + '</div>';
    if (vers.length > 1) o += '<div class="vz-chips" role="group" aria-label="Versiones">' + vers.map(function (x) {
      return '<button type="button" class="vz-chip' + (x.n === d.version ? ' vz-on' : '') + '" data-v="' + esc(x.n) + '" title="' + esc(x.nombre) + '">V' + esc(x.n) + ' · ' + esc(corta(x.nombre || x.estado, 20)) + (x.estado === 'vigente' ? ' ✓' : '') + '</button>';
    }).join('') + '</div>';
    return o;
  }
  /* El selector de Dirección: sólo sale si el servidor lo manda (`elige`, a quien puede aprobar). Escoge
     cuál versión es «la buena», la que ven todos los que tienen la liga. No se confunde con los selectores
     de arriba (versiones o terrenos que la liga deja recorrer a cada quien). `v` es el id de la versión tal
     como lo manda el servidor (un texto, a veces vacío): se devuelve igual, nunca se convierte en número. */
  function idElige(x) { return x && x.v != null ? String(x.v) : ''; }
  function nombreElige(x) { return String((x && (x.nombre || x.v)) || 'Base'); }
  function eligeHtml(d) {
    var vs = (d.elige && d.elige.versiones) || [];
    if (!vs.length) return '';
    return '<section class="vz-elige" aria-label="Dirección: la versión que ven todos">' +
      '<div class="vz-elige-cab"><span class="vz-elige-tit">La versión que ven todos</span><span class="vz-elige-solo">sólo tú ves esto</span></div>' +
      '<div class="vz-elige-ops" role="radiogroup" aria-label="Versión buena">' + vs.map(function (x) {
        var nom = nombreElige(x);
        return '<button type="button" class="vz-elige-op' + (x.buena ? ' vz-buena' : '') + '" role="radio" aria-checked="' + (x.buena ? 'true' : 'false') + '" data-elige="' + esc(idElige(x)) + '" data-nombre="' + esc(nom) + '" title="' + esc(nom) + '">' +
          '<b>' + esc(corta(nom, 24)) + '</b>' + (x.buena ? '<i>la buena</i>' : '') + '</button>';
      }).join('') + '</div><p class="vz-elige-msg" role="status" aria-live="polite"></p></section>';
  }
  function pieMarcas(marcas) {
    if (!marcas || !marcas.length) return '';
    return '<div class="vz-marcas">' + marcas.map(function (m) {
      return m.img && /^data:image\//.test(m.img) ? '<img src="' + esc(m.img) + '" alt="' + esc(m.nombre) + '">' : '<span>' + esc(m.nombre) + '</span>';
    }).join('') + '</div>';
  }
  /* `op.sinElige`: la página con pestañas lleva el selector de Dirección en «Opciones», no arriba del plan. */
  function pinta(d, marcas, op) {
    var cs = cuadros(d), hayDed = !!DED;
    op = op || {};
    return {
      cuadros: cs,
      html: encabezado(d) + (op.sinElige ? '' : eligeHtml(d)) + selector(d) + (d.a_medias ? '<p class="vz-aviso">El plan está recalculando esta versión: las cifras pueden moverse.</p>' : '') +
        '<main class="vz-grid">' + cs.map(tarjeta).join('') + '</main>' + pieMarcas(marcas) +
        '<footer class="vz-pie"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg><span>Cifras en millones de pesos · Confidencial: quien tenga esta liga ve el plan. No la reenvíes.</span></footer>' +
        (hayDed ? '<p class="vz-pie vz-pie-ded">' + ICONO_DED + '<span>Algunas cifras se deducen de las del motor: toca una para ver de qué salen.</span></p>' : '')
    };
  }
  /* Qué es cada cuadro, dicho para quien no es financiero (sale arriba de su hoja). */
  var QUE = {
    reparto: 'Quién pone qué y cuánto recibe al final. «Veces lo que puso» compara lo que recibe con lo que puso.',
    terreno: 'El terreno, lo que se construye en él y la parte que se puede vender.',
    producto: 'Lo que se vende: cada tipo de unidad, cuántas son y cuánto suman sus ventas.',
    tiempo: 'Cuándo se vende, cuándo se construye y cuándo se cobra y se reparte, en meses desde el arranque.',
    costo: 'De todo lo que se vende, cuánto se va a cada costo y cuánto queda de utilidad.',
    dinero: 'Lo que entra y lo que sale con el tiempo, y quién pone el dinero mientras lo vendido todavía no alcanza.',
    riesgo: 'Las nueve pruebas que revisa un banco antes de prestar, y cómo aguanta el plan si las cosas salen peor.'
  };
  /* ───────────────────────── qué es cada cifra y de qué depende ─────────────────────────
     Los textos viven en visor-explica.js (window.VisorExplica, una entrada por cifra) y lo que lee cada fórmula en
     visor-explica-grafo.js (window.VISOR_EXPLICA_GRAFO, generado de la plantilla del libro por ppp2/libro/explica.py).
     Aquí sólo se juntan: el texto, las cifras que el servidor ya trae (formateadas, sin ninguna cuenta) y las entradas
     de la fórmula. Si alguno de los dos archivos no cargó, el visor es el de siempre. */
  function textos() { return root.VisorExplica || null; }
  function grafo() { return root.VISOR_EXPLICA_GRAFO || null; }
  function explicaDe(x) { var t = textos(); return x && t && Object.prototype.hasOwnProperty.call(t, x) ? t[x] : null; }
  /* Una cifra que el servidor ya trae, tal cual (sólo se formatea); si no vino, vacío y el texto la dice sin cifra. */
  function cifraDe(ruta, formato) {
    var d = ACTUAL || {}, p = String(ruta || '').split('.'), k = p.slice(1).join('.'), x = null;
    if (p[0] === 'v') x = (d.v || {})[k];
    else if (p[0] === 'datos') x = ((d.datos || {})[k] || {}).valor;
    else if (p[0] === 'plan') x = (d.plan || {})[k];
    else if (p[0] === 'flujo' && p[1] === 'total') x = d.flujo && d.flujo.total ? d.flujo.total[p.slice(2).join('.')] : null;
    if (num(x) === null) return '';
    if (formato === 'mdp') return mdp(x);
    if (formato === 'pct') return pct(x);
    if (formato === 'mes') return 'mes ' + ent(x);
    if (formato === 'meses') return ent(x) + ' meses';
    if (formato === 'u') return ent(x) + ' unidades';
    if (formato === 'veces') return x.toFixed(2) + '×';
    if (formato === 'm2') return ent(x) + ' m²';
    return ent(x);
  }
  /* Las entradas de una fórmula, juntas por tipo: palanca, dato, resultado (los nombres son los del libro). */
  var TIPOS_X = [['palanca', 'palanca', 'palancas'], ['dato', 'dato', 'datos'], ['resultado', 'resultado', 'resultados']];
  function gruposX(ids, G) {
    var por = {};
    ids.forEach(function (i) { var n = G.nodos[i]; if (n) (por[n.t] = por[n.t] || []).push(n.n); });
    return '<ul class="vz-x-g">' + TIPOS_X.filter(function (t) { return por[t[0]]; }).map(function (t) {
      return '<li><span class="vz-x-tipo vz-x-' + t[0] + '">' + (por[t[0]].length > 1 ? t[2] : t[1]) + '</span><span class="vz-x-lista">' +
        por[t[0]].map(esc).join('<i aria-hidden="true"> · </i><span class="vz-sr">, </span>') + '</span></li>';
    }).join('') + '</ul>';
  }
  /* Un plan del PPP de siempre (foto): su cifra la dio el motor de su tablero; si se dedujo, la marca dice de qué. */
  function deducidaX(x) { return DED ? deducidoDe(/^(v|plan|datos)\./.test(x) ? [x] : []) : ''; }
  function dependeHtml(x, e) {
    if (ORIGEN) return '<p>Esta cifra sale del motor de su tablero del PPP de siempre (es una foto), no de las fórmulas de un libro: el visor no tiene el detalle de sus entradas.</p>';
    var G = grafo();
    if (!G || !G.figuras) return '';
    /* una cifra que acomoda el visor (un cociente o una suma de cifras del libro): de qué sale cada una de ellas */
    if (e.de) {
      var partes = e.de.filter(function (k) { return G.figuras[k]; }).map(function (k) {
        var g = G.figuras[k], n = G.nodos[g.yo];
        return '<p class="vz-x-sub">' + esc(n ? n.n : k) + (g.d.length ? ' sale de' : ': no sale de otra cifra') + '</p>' + (g.d.length ? gruposX(g.d, G) : '');
      });
      return partes.length ? '<p class="vz-x-sub">La acomoda el visor con cifras del libro.</p>' + partes.join('') + LEYENDA_X : '';
    }
    var f = G.figuras[e.figura || x];
    if (!f) return '';
    if (!f.d.length) {
      var yo = G.nodos[f.yo] || {};
      return '<p>' + (yo.t === 'palanca' ? 'No sale de otra cifra: es una decisión del plan (una palanca).' : 'No sale de otra cifra: es un dato del plan.') + '</p>';
    }
    var s = e.segundo === false ? {} : (f.s || {});
    return '<p class="vz-x-sub">' + esc(e.dep || 'Sale directo de') + '</p>' + gruposX(f.d, G) +
      f.d.filter(function (i) { return s[i] && s[i].length; }).map(function (i) {
        return '<p class="vz-x-sub">' + esc((G.nodos[i] || {}).n || i) + ' sale de</p>' + gruposX(s[i], G);
      }).join('') + LEYENDA_X;
  }
  var LEYENDA_X = '<p class="vz-x-ley">Palanca: una decisión que cada versión puede mover. Dato: fijo para el plan (del terreno, del mercado, de la norma o de sus registros). Resultado: sale de otras cifras.</p>';
  function bloqueX(titulo, cuerpo) { return cuerpo ? '<div class="vz-x-b"><p class="vz-x-k">' + titulo + '</p>' + cuerpo + '</div>' : ''; }
  function minus1(t) { t = String(t || ''); return t.charAt(0).toLowerCase() + t.slice(1); }
  function fuenteX(x, e) {
    if (ORIGEN) return ORIGEN;
    if (e.fuente) return String(e.fuente).replace('{v}', 'v' + VER);
    var G = grafo(), uno = function (k) {
      if (/^v\./.test(k)) return 'Resumen · v' + VER + '.' + k.slice(2);
      if (/^plan\./.test(k)) return 'Resumen · ' + k;
      if (/^datos\./.test(k)) return 'Datos · ' + k.slice(6);
      if (/^flujo\./.test(k)) { var f = G && G.figuras && G.figuras[k], n = f && G.nodos[f.yo]; return 'Flujo V' + VER + (n ? ' · ' + n.n : ''); }
      if (k === 'productos') return 'Productos';
      if (k === 'reparto.esquema') return 'Reparto · esquema elegido';
      return '';
    };
    if (e.de) return 'Lo acomoda el visor con cifras del libro del plan: ' + e.de.map(uno).filter(Boolean).join('; ');
    var u = uno(x);
    return 'Libro del plan' + (u ? ' · ' + u : '');
  }
  /* Lo que se despliega bajo el renglón: qué es, cómo se calcula (con las cifras de esta versión), cómo está hoy,
     de qué depende (del grafo), qué la mueve, por qué importa y de dónde sale. `hoy` es texto ya armado por el cuadro. */
  function explicaHtml(x, hoy) {
    var e = explicaDe(x);
    if (!e) return '';
    var cif = (e.cifras || []).map(function (c) { var v = cifraDe(c[1], c[2]); return v ? esc(c[0]) + ' <b>' + esc(v) + '</b>' : ''; }).filter(Boolean);
    var ded = ORIGEN ? deducidaX(x) : '';
    /* en una foto, si la cifra se dedujo, manda su marca (dice cómo se sacó en esa foto); si no, la definición del libro */
    var como = (ded ? '<p>' + esc(mayus1(ded)) + '.</p>'
      : '<p>' + esc(e.como) + (e.banco ? ' Si la versión no usa banco, esta prueba no aplica.' : '') + (ORIGEN ? ' Así la define el libro del PPP 2; en esta foto la dio el motor de su tablero.' : '') + '</p>') +
      (cif.length ? '<p class="vz-x-cif">En esta versión: ' + cif.join(' · ') + '.</p>' : '') + (e.sin_cifra && !ORIGEN ? '<p class="vz-x-cif">' + esc(e.sin_cifra) + '</p>' : '');
    var mueve = ORIGEN ? '' : (e.mejora || e.empeora ? (e.mejora ? '<p><b>Mejora:</b> ' + esc(minus1(e.mejora)) + '</p>' : '') + (e.empeora ? '<p><b>Empeora:</b> ' + esc(minus1(e.empeora)) + '</p>' : '')
      : (e.cambia ? '<p>' + esc(e.cambia) + '</p>' : ''));
    return '<p class="vz-x-que">' + esc(e.que) + '</p>' + bloqueX('Cómo se calcula', como) + (hoy ? bloqueX('Hoy', '<p>' + esc(hoy) + '</p>') : '') +
      bloqueX('De qué depende', dependeHtml(x, e)) + bloqueX('Qué la mueve', mueve) + bloqueX('Por qué importa', e.importa ? '<p>' + esc(e.importa) + '</p>' : '') +
      '<p class="vz-x-fuente">' + esc(fuenteX(x, e)) + '</p>';
  }
  var CHEVRON = '<svg class="vz-xb-ic" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5L7.5 6L4 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  var NX = 0;
  /* Un renglón del desglose. Si su cifra tiene texto (f[3]), el renglón se abre ahí mismo: qué es y de qué depende. */
  function filaHtml(f) {
    var cuerpo = f[3] ? explicaHtml(f[3], f[4]) : '';
    if (!cuerpo) return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>' + (f[2] ? origenFila(f[2]) : '') + '</div>';
    var id = 'vzX' + (++NX);
    return '<div class="vz-xf"><dt><button type="button" class="vz-xb" aria-expanded="false" aria-controls="' + id + '" aria-label="' + esc(f[0] + ': qué es y de qué depende') + '" data-x="' + esc(f[3]) + '">' + CHEVRON +
      '<span>' + esc(f[0]) + '</span></button></dt><dd>' + esc(f[1]) + '</dd>' + (f[2] ? origenFila(f[2]) : '') +
      '<div class="vz-xp" id="' + id + '" role="region" aria-label="' + esc(f[0]) + '" hidden>' + cuerpo + '</div></div>';
  }
  function detalleHtml(c) {
    NX = 0;
    var hay = c.detalle.some(function (s) { return s.filas.some(function (f) { return f[3] && explicaDe(f[3]); }); });
    return '<div class="vz-m-head"><span class="vz-asa" aria-hidden="true"></span><div><h2 class="vz-tit" id="vzMTit">' + esc(c.titulo) + '</h2><span class="vz-sub">' + c.sub + '</span></div>' +
      '<button type="button" class="vz-x" aria-label="Cerrar"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg></button></div>' +
      (QUE[c.id] ? '<p class="vz-m-que">' + esc(QUE[c.id]) + '</p>' : '') + '<div class="vz-m-fig">' + svgDe(c, true) + '</div>' + pieFecha(c) +
      '<p class="vz-m-pista">Toca una cifra o una figura para ver qué hay detrás y de dónde sale' + (hay ? '; toca un renglón con flecha para ver qué es y de qué depende' : '') + '. Cifras en millones de pesos.</p>' +
      c.detalle.map(function (s) {
        return '<h3>' + esc(s.h) + '</h3><dl>' + s.filas.map(filaHtml).join('') + '</dl>';
      }).join('');
  }

  function soloCuadros(cs) { return '<main class="vz-grid">' + cs.map(tarjeta).join('') + '</main>'; }

  /* ───────────────────────── los cuadros, vivos en una página ─────────────────────────
     Pone los cuadros en `caja` y les da su pop-up (dentro de la misma página) y su leyenda. Lo usan la
     página del visor (la pantalla completa, a escala del teléfono) y la ficha del plan (sólo la rejilla,
     `incrustado`). No pide nada a la red: quien lo monta le entrega lo que el servidor leyó del libro. */
  function monta(caja, op) {
    op = op || {};
    var doc = caja.ownerDocument, win = doc.defaultView, modal = doc.getElementById('vzModal'), burbuja = doc.getElementById('vzTip'), hoja;
    var act = [], firmas = {};
    if (!modal) {
      modal = doc.createElement('div'); modal.id = 'vzModal'; modal.className = 'vz-modal'; modal.hidden = true;
      modal.innerHTML = '<div class="vz-m-caja" role="dialog" aria-modal="true" aria-labelledby="vzMTit" tabindex="-1"></div>';
      doc.body.appendChild(modal);
    }
    if (!burbuja) { burbuja = doc.createElement('div'); burbuja.id = 'vzTip'; burbuja.className = 'vz-tip'; burbuja.setAttribute('role', 'tooltip'); burbuja.hidden = true; doc.body.appendChild(burbuja); }
    hoja = modal.firstElementChild;
    caja.classList.add(op.incrustado ? 'vz-inc' : 'vz');
    /* cuál cuadro está abierto lo sabe el pop-up, no quien lo montó: la ficha vuelve a montar los cuadros cada vez que se repinta */
    var abierto = function () { return modal.getAttribute('data-abierto') || ''; };
    var reducido = function () { try { return win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

    /* La pantalla mide BASE de ancho: se escala al ancho del teléfono y, si por poco no cabe a lo alto, se
       encoge hasta 10 % más para que quepa sin deslizar. En pantalla ancha y apaisada (escritorio, tableta
       acostada) los cuadros van en cuatro columnas y caben a lo alto; en una tableta parada, en dos, centrados.
       Incrustada en la ficha, la rejilla llena el ancho que le den: dos columnas, o cuatro si hay lugar. */
    function ajusta() {
      var marco = caja.parentNode, alto, s;
      if (op.incrustado) {
        var ancho = marco.clientWidth || 440, cuatro = ancho >= 720, base = cuatro ? 840 : 416;
        caja.classList.toggle('vz-4', cuatro);
        s = Math.min(cuatro ? 1.45 : 1.7, ancho / base);
        caja.style.width = base + 'px';
        caja.style.transform = 'scale(' + s + ')';
        marco.style.height = (Math.max(1, caja.offsetHeight) * s) + 'px';
        return;
      }
      /* con la pestaña Plan oculta no hay qué medir: se ajusta al volver a ella. La barra de pestañas (fija abajo)
         no cuenta como alto disponible. */
      if (!marco.offsetParent) return;
      var barra = doc.getElementById('vzBarra'), hb = barra && !barra.hidden ? Math.max(0, win.innerHeight - barra.getBoundingClientRect().top) : 0;
      var W = doc.documentElement.clientWidth || win.innerWidth, H = Math.max(200, win.innerHeight - hb), ancha = W >= 960 && W > H * 1.15, base = ancha ? BASE4 : BASE;
      caja.classList.toggle('vz-4', ancha);
      caja.style.width = base + 'px';
      alto = Math.max(1, caja.offsetHeight); s = W / base;
      if (W > 700) s = Math.max(0.6, Math.min(ancha ? 1.6 : 1.7, (W - 48) / base, (H - 24) / alto));
      else if (alto * s > H) s = Math.max(H / alto, 0.9 * s);
      caja.style.transform = 'scale(' + s + ')';
      marco.style.width = (base * s) + 'px';
      marco.style.height = (alto * s) + 'px';
      marco.style.marginTop = W > 700 ? Math.max(0, (H - alto * s) / 2) + 'px' : '0';
    }
    function quitaEsqueleto() { var e = doc.getElementById('vzEsq'); if (e) e.parentNode.removeChild(e); caja.removeAttribute('aria-busy'); }
    function mensaje(titulo, texto, tipo) {
      cierra();
      quitaEsqueleto();
      act = []; firmas = {};
      var icono = tipo === 'llave' ? '<path d="M8 11V7a4 4 0 0 1 8 0v4"></path><rect x="5" y="11" width="14" height="10" rx="2"></rect>'
        : '<path d="M12 8v5"></path><circle cx="12" cy="16.5" r=".6" fill="currentColor"></circle><circle cx="12" cy="12" r="9"></circle>';
      caja.innerHTML = '<div class="vz-msg' + (tipo ? ' vz-msg-' + tipo : '') + '" role="alert"><span class="vz-msg-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icono + '</svg></span>' +
        '<h1>' + esc(titulo) + '</h1><p>' + esc(texto) + '</p>' + (tipo === 'falla' ? '<button type="button" class="vz-otra" data-otra="1">Volver a intentar</button>' : '') + '</div>';
      ajusta();
    }
    /* marca: los cuadros que cambiaron respecto a lo que había pintado se resaltan (un cambio del libro). */
    function muestra(d, marcas, marca) {
      var cs = cuadros(d), antes = firmas, ahora = {};
      act = cs;
      quitaEsqueleto();
      caja.innerHTML = op.incrustado ? soloCuadros(cs) : pinta(d, marcas, { sinElige: op.sinElige }).html;
      cs.forEach(function (c) { ahora[c.id] = c.svg; });
      if (marca) Array.prototype.forEach.call(caja.querySelectorAll('.vz-card'), function (el) {
        var id = el.getAttribute('data-card');
        if (antes[id] && antes[id] !== ahora[id]) el.classList.add('vz-cambio');
      });
      firmas = ahora;
      Object.keys(pans).forEach(function (id) { var card = caja.querySelector('[data-card="' + id + '"]'); if (card) panea(card, 0, pans[id]); });
      ajusta();
      /* con muchas versiones el selector de Dirección se recorre de lado: que la buena quede a la vista */
      var eb = caja.querySelector('.vz-elige-op.vz-buena'), eo = eb && eb.parentNode;
      if (eo && eo.scrollWidth > eo.clientWidth) eo.scrollLeft = Math.max(0, eb.offsetLeft - eo.firstElementChild.offsetLeft - 12);
      Array.prototype.forEach.call(caja.querySelectorAll('.vz-marcas img'), function (im) { if (!im.complete) im.addEventListener('load', ajusta); });
      if (abierto()) abre(abierto(), true);
    }
    function olvida() { firmas = {}; }
    /* pop-up de un cuadro: una hoja que sube dentro de la misma página; atrás, Esc, la ×, tocar fuera o
       bajarla con el dedo la cierran. El foco entra a la hoja y regresa al cuadro al cerrar. */
    var previo = null;
    function abre(id, repinta) {
      var c = act.filter(function (x) { return x.id === id; })[0];
      if (!c) { if (repinta) cierra(); return; }
      var top = repinta ? hoja.scrollTop : 0;
      /* al repintarse sola (cambió el libro), los renglones que estaban abiertos siguen abiertos */
      var abiertos = repinta ? Array.prototype.map.call(hoja.querySelectorAll('.vz-xb[aria-expanded="true"]'), function (b) { return b.getAttribute('data-x'); }) : [];
      hoja.innerHTML = detalleHtml(c);
      abiertos.forEach(function (x) { var f = filaX(x); if (f) alterna(f, true); });
      quitaBurbuja();
      if (repinta) { hoja.scrollTop = top; return; }
      previo = doc.activeElement;
      modal._vzTurno = (modal._vzTurno || 0) + 1;   // cada apertura es un turno: lo que quedó pendiente de la anterior ya no la cierra
      modal.setAttribute('data-abierto', id);
      modal.classList.remove('vz-baja');
      hoja.style.transform = '';
      modal.hidden = false;
      hoja.scrollTop = 0;
      doc.documentElement.classList.add('vz-con-modal');
      var x = hoja.querySelector('.vz-x');
      try { (x || hoja).focus({ preventScroll: true }); } catch (e) { }
      try { win.history.pushState({ vz: id }, ''); } catch (e) { }
    }
    function cierra(desdeHistoria) {
      if (!abierto()) return;
      modal.removeAttribute('data-abierto');
      modal.hidden = true;
      modal.classList.remove('vz-baja');
      hoja.style.transform = '';
      doc.documentElement.classList.remove('vz-con-modal');
      quitaBurbuja();
      if (previo && previo.focus && doc.contains(previo)) { try { previo.focus({ preventScroll: true }); } catch (e) { } }
      else { var card = caja.querySelector('[data-card="' + (modal._vzUltimo || '') + '"]'); if (card) try { card.focus({ preventScroll: true }); } catch (e) { } }
      previo = null;
      /* el «atrás» que pide este cierre llega después (es asíncrono): se cuenta para que, si mientras tanto se abrió
         otra hoja, no la cierre */
      if (!desdeHistoria) { try { if (win.history.state && win.history.state.vz) { modal._vzAtras = (modal._vzAtras || 0) + 1; win.history.back(); } } catch (e) { } }
    }
    /* bajar la hoja con el dedo: desde el asa o el encabezado; si baja lo suficiente (o rápido), se cierra */
    function bajaConGesto(y0, t0, id) {
      var dy = 0, turno = modal._vzTurno;
      return {
        mueve: function (y) { dy = Math.max(0, y - y0); hoja.style.transform = dy ? 'translateY(' + dy + 'px)' : ''; },
        suelta: function (y, t) {
          var vel = (y - y0) / Math.max(1, t - t0);
          if (dy > 90 || (dy > 24 && vel > 0.55)) {
            if (reducido()) { cierra(); return; }
            modal.classList.add('vz-baja');
            hoja.style.transform = 'translateY(110%)';
            setTimeout(function () { if (abierto() === id && modal._vzTurno === turno) cierra(); }, 200);
          } else {
            hoja.style.transition = 'transform .18s ease-out'; hoja.style.transform = '';
            setTimeout(function () { hoja.style.transition = ''; }, 200);
          }
        }
      };
    }
    function quitaBurbuja() {
      burbuja.hidden = true;
      burbuja.removeAttribute('data-fija');
      var sel = doc.querySelector('.vz-sel');
      if (sel) sel.classList.remove('vz-sel');
    }
    /* El renglón del desglose que explica una cifra (clave de visor-explica.js) y abrirlo o cerrarlo ahí mismo. */
    function filaX(x) {
      if (!/^[a-z0-9_.]+$/i.test(String(x || ''))) return null;
      var b = hoja.querySelector('.vz-xb[data-x="' + x + '"]');
      return b ? b.closest('.vz-xf') : null;
    }
    function alterna(fila, abrir) {
      var b = fila.querySelector('.vz-xb'), p = fila.querySelector('.vz-xp');
      if (!b || !p) return;
      if (abrir == null) abrir = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      p.hidden = !abrir;
      fila.classList.toggle('vz-xf-on', abrir);
    }
    /* «Qué es y de qué depende» desde la leyenda: abre el renglón de esa cifra, lo trae a la vista bajo el encabezado de
       la hoja y le pasa el foco (así el teclado y el lector de pantalla siguen desde ahí). */
    function explica(x) {
      var f = filaX(x);
      if (!f) return;
      quitaBurbuja();
      alterna(f, true);
      var cab = hoja.querySelector('.vz-m-head'), alto = cab ? cab.offsetHeight : 0;
      var top = Math.max(0, f.getBoundingClientRect().top - hoja.getBoundingClientRect().top + hoja.scrollTop - alto - 6);
      try { hoja.scrollTo({ top: top, behavior: reducido() ? 'auto' : 'smooth' }); } catch (e) { hoja.scrollTop = top; }
      var b = f.querySelector('.vz-xb');
      try { b.focus({ preventScroll: true }); } catch (e) { }
    }
    /* La leyenda se pone arriba del punto tocado, lejos del dedo; si no cabe arriba, junto al borde de arriba
       de la pantalla o, como último recurso, abajo con más aire. Si la cifra tiene texto, dice en una línea qué es y,
       dentro de la hoja, ofrece abrir su renglón. `fija`: se puso con un toque o un clic (no al pasar el ratón): se
       queda hasta otro toque, Esc o desplazar la hoja. */
    function ponBurbuja(el, x, y, dedo, fija) {
      var t;
      try { t = JSON.parse(el.getAttribute('data-t')); } catch (e) { return; }
      quitaBurbuja();
      el.classList.add('vz-sel');
      var ex = t.x ? explicaDe(t.x) : null, mas = ex && el.closest && el.closest('.vz-m-fig') && filaX(t.x);
      burbuja.innerHTML = '<b>' + esc(t.t) + '</b>' + (t.f || []).map(function (f) { return '<div><span>' + esc(f[0]) + '</span><span>' + esc(f[1]) + '</span></div>'; }).join('') +
        (ex && ex.corto ? '<p class="vz-tip-que">' + esc(ex.corto) + '</p>' : '') + (t.o ? origenTip(t.o) : '') +
        (mas ? '<button type="button" class="vz-tip-mas" data-x="' + esc(t.x) + '">Qué es y de qué depende<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5L7.5 6L4 9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>' : '');
      if (fija) burbuja.setAttribute('data-fija', '1');
      burbuja.hidden = false;
      modal._vzTop = hoja.scrollTop;
      var w = burbuja.offsetWidth, h = burbuja.offsetHeight, W = doc.documentElement.clientWidth || win.innerWidth, H = win.innerHeight, aire = dedo ? 34 : 14;
      burbuja.style.left = clamp(x - w / 2, 8, Math.max(8, W - w - 8)) + 'px';
      burbuja.style.top = (y - h - aire > 8 ? y - h - aire : Math.min(Math.max(8, H - h - 8), y + (dedo ? 44 : 18))) + 'px';
    }
    /* objetivo táctil de 44 px: si el dedo cae junto a una figura y no encima, se toma la más cercana */
    var RONDA = [[0, -12], [0, 12], [-12, 0], [12, 0], [-12, -12], [12, -12], [-12, 12], [12, 12], [0, -22], [0, 22], [-22, 0], [22, 0]];
    function cercana(x, y) {
      for (var i = 0; i < RONDA.length; i++) {
        var el = doc.elementFromPoint(x + RONDA[i][0], y + RONDA[i][1]), t = el && el.closest ? el.closest('.vz-m-fig .vz-t') : null;
        if (t) return t;
      }
      return null;
    }
    var cerca = function (e, sel) { return e.target && e.target.closest ? e.target.closest(sel) : null; };
    caja.addEventListener('click', function (e) {
      if (Date.now() - recienPan < 400) return;   // fue un recorrido de lado, no un toque
      var chip = cerca(e, '.vz-chip'), card = cerca(e, '.vz-card'), otra = cerca(e, '.vz-otra');
      if (otra) { try { win.location.reload(); } catch (er) { } return; }
      var op1 = cerca(e, '.vz-elige-op');
      if (op1) { if (!/vz-buena/.test(op1.className) && op.alElegir) op.alElegir({ v: op1.getAttribute('data-elige') || '', nombre: op1.getAttribute('data-nombre') || '' }); return; }
      if (chip) {
        Array.prototype.forEach.call(chip.parentNode.children, function (c) { c.classList.toggle('vz-on', c === chip); c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        if (op.alEscoger) op.alEscoger(chip.getAttribute('data-plan') ? { plan: chip.getAttribute('data-plan') } : { v: Number(chip.getAttribute('data-v')) || 0 });
      } else if (card) { modal._vzUltimo = card.getAttribute('data-card'); abre(card.getAttribute('data-card')); }
    });
    /* Recorrer de lado las gráficas largas (Tiempo y Dinero): dos dedos en el teléfono, la rueda o arrastrar
       con el ratón. Un dedo hace lo de siempre (desplazar la página, tocar para abrir). */
    var pans = {}, dedos = {}, gesto2 = null, recienPan = 0;
    function panea(card, du, fijo) {
      var off = 0, max = 0;
      Array.prototype.forEach.call(card.querySelectorAll('.vz-pan'), function (g) {
        max = Number(g.getAttribute('data-pan-max')) || 0;
        off = clamp(fijo != null ? fijo : (Number(g.getAttribute('data-off')) || 0) + du, 0, max);
        g.setAttribute('data-off', f1(off)); g.setAttribute('transform', 'translate(' + f1(-off) + ' 0)');
      });
      Array.prototype.forEach.call(card.querySelectorAll('.vz-des-i'), function (x) { x.setAttribute('opacity', off > 0.5 ? '1' : '0'); });
      Array.prototype.forEach.call(card.querySelectorAll('.vz-des-d'), function (x) { x.setAttribute('opacity', off < max - 0.5 ? '1' : '0'); });
      pans[card.getAttribute('data-card')] = off;
    }
    function escalaDe(card) { var g = card.querySelector('svg'), m = g && g.getScreenCTM && g.getScreenCTM(); return (m && m.a) || 1; }
    function tarjetaPan(e) { var card = cerca(e, '.vz-card'); return card && card.querySelector('.vz-pan') ? card : null; }
    caja.addEventListener('wheel', function (e) {
      var card = tarjetaPan(e); if (!card) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (op.incrustado ? 0 : e.deltaY);
      if (!d) return;
      e.preventDefault();
      panea(card, d / escalaDe(card));
    }, { passive: false });
    caja.addEventListener('pointerdown', function (e) {
      var card = tarjetaPan(e); if (!card) return;
      dedos[e.pointerId] = { x: e.clientX, card: card, tipo: e.pointerType };
      var ids = Object.keys(dedos).filter(function (k) { return dedos[k].card === card && dedos[k].tipo === 'touch'; });
      if (e.pointerType === 'touch' && ids.length >= 2) gesto2 = { card: card, mid: (dedos[ids[0]].x + dedos[ids[1]].x) / 2, ids: ids.slice(0, 2), movio: false };
      else if (e.pointerType === 'mouse' && e.button === 0) gesto2 = { card: card, raton: true, x: e.clientX, x0: e.clientX, movio: false };
    });
    caja.addEventListener('pointermove', function (e) {
      if (dedos[e.pointerId]) dedos[e.pointerId].x = e.clientX;
      if (!gesto2) return;
      if (gesto2.raton) {
        if (e.pointerId !== undefined && e.pointerType !== 'mouse') return;
        if (!gesto2.movio && Math.abs(e.clientX - gesto2.x0) < 5) return;
        gesto2.movio = true; panea(gesto2.card, -(e.clientX - gesto2.x) / escalaDe(gesto2.card)); gesto2.x = e.clientX; return;
      }
      var a = dedos[gesto2.ids[0]], b = dedos[gesto2.ids[1]]; if (!a || !b) return;
      var mid = (a.x + b.x) / 2;
      if (Math.abs(mid - gesto2.mid) > 0.5) { gesto2.movio = true; panea(gesto2.card, -(mid - gesto2.mid) / escalaDe(gesto2.card)); gesto2.mid = mid; }
      if (e.cancelable) e.preventDefault();
    });
    var suelta2 = function (e) {
      delete dedos[e.pointerId];
      if (gesto2 && (gesto2.raton || gesto2.ids.indexOf(String(e.pointerId)) >= 0)) { if (gesto2.movio) recienPan = Date.now(); gesto2 = null; }
    };
    caja.addEventListener('pointerup', suelta2);
    caja.addEventListener('pointercancel', suelta2);
    caja.addEventListener('keydown', function (e) {
      var card = cerca(e, '.vz-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); modal._vzUltimo = card.getAttribute('data-card'); abre(card.getAttribute('data-card')); }
    });
    /* El pop-up y la leyenda son uno por página: sus oyentes se ponen una sola vez y hablan con quien esté abierto. */
    if (!modal._vz) {
      modal._vz = { cierra: cierra, pon: ponBurbuja, quita: quitaBurbuja, ajusta: ajusta, cercana: cercana, gesto: bajaConGesto, abierto: abierto, explica: explica, alterna: alterna };
      var tipo = 'mouse', gesto = null;
      win.addEventListener('resize', function () { modal._vz.ajusta(); });
      doc.addEventListener('pointerdown', function (e) { tipo = e.pointerType || 'mouse'; }, true);
      modal.addEventListener('click', function (e) {
        var ded = cerca(e, '.vz-ded');
        if (ded) {                                   // el chip «deducido»: abre y cierra su nota
          var abierta = ded.getAttribute('aria-expanded') === 'true', nota = ded.parentNode.nextElementSibling;
          ded.setAttribute('aria-expanded', abierta ? 'false' : 'true');
          if (nota && /vz-ded-txt/.test(nota.className)) nota.hidden = abierta;
          return;
        }
        /* un renglón que explica su cifra se abre o se cierra con un toque en cualquier parte de él (su botón lleva el
           teclado); dentro de lo abierto, o en otro botón o enlace del renglón (el lápiz de la ficha), no */
        var fx = cerca(e, '.vz-xf');
        if (fx && !cerca(e, '.vz-xp') && !cerca(e, 'a, button:not(.vz-xb)')) { modal._vz.quita(); modal._vz.alterna(fx); return; }
        var t = cerca(e, '.vz-t'), dedo = tipo !== 'mouse';
        if (e.target === modal || cerca(e, '.vz-x')) { modal._vz.cierra(); return; }
        if (!t && dedo && cerca(e, '.vz-m-fig')) t = modal._vz.cercana(e.clientX, e.clientY);
        if (t) modal._vz.pon(t, e.clientX, e.clientY, dedo, true); else modal._vz.quita();
      });
      /* «Qué es y de qué depende» en la leyenda (lo único de la leyenda que se toca) */
      burbuja.addEventListener('click', function (e) {
        var b = cerca(e, '.vz-tip-mas');
        if (b) { e.preventDefault(); modal._vz.explica(b.getAttribute('data-x')); }
      });
      /* con ratón, la leyenda sale al pasar por encima (también sobre los cuadros de la pantalla); la que se fijó con un
         clic se queda hasta otro clic, Esc o desplazar la hoja, para poder llegar a su botón */
      doc.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        if (!burbuja.hidden && burbuja.getAttribute('data-fija') === '1') return;
        var t = cerca(e, '.vz-t');
        if (t) modal._vz.pon(t, e.clientX, e.clientY, false); else if (!burbuja.hidden) modal._vz.quita();
      });
      /* Chromium: el gesto rápido de bajar la hoja deja un «fling» aunque el encabezado no se desplace, y el
         siguiente toque (hasta ~½ s después) se gasta en detenerlo: no llega su click. Cancelar touchstart en el
         encabezado evita que nazca ese gesto; los eventos de puntero, que mueven la hoja, siguen llegando. */
      hoja.addEventListener('touchstart', function (e) { var t = e.target; if (t.closest && t.closest('.vz-m-head') && !t.closest('.vz-x')) e.preventDefault(); }, { passive: false });
      /* en el pop-up, con el dedo: deslizar de lado recorre la figura; desde el encabezado, bajar cierra */
      hoja.addEventListener('pointerdown', function (e) {
        if (!e.isPrimary || !(e.target.closest && e.target.closest('.vz-m-head')) || (e.target.closest && e.target.closest('.vz-x'))) return;
        gesto = modal._vz.gesto(e.clientY, e.timeStamp, modal._vz.abierto());
      });
      hoja.addEventListener('pointermove', function (e) {
        if (gesto && e.isPrimary) { gesto.mueve(e.clientY); return; }
        if (e.pointerType === 'mouse' || !e.isPrimary) return;
        var el = doc.elementFromPoint(e.clientX, e.clientY), t = el && el.closest ? el.closest('.vz-m-fig .vz-t') : null;
        if (t) modal._vz.pon(t, e.clientX, e.clientY, true, true);
      });
      var suelta = function (e) { if (gesto) { var g = gesto; gesto = null; g.suelta(e.clientY, e.timeStamp); } };
      hoja.addEventListener('pointerup', suelta);
      hoja.addEventListener('pointercancel', function () { if (gesto) { gesto = null; hoja.style.transform = ''; } });
      /* deslizar la hoja quita la leyenda (pero no un ajuste de unos cuantos píxeles al tocar) */
      hoja.addEventListener('scroll', function () { if (Math.abs(hoja.scrollTop - (modal._vzTop || 0)) > 8) modal._vz.quita(); });
      doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { if (!burbuja.hidden) modal._vz.quita(); else modal._vz.cierra(); return; }
        /* el foco no sale de la hoja mientras está abierta */
        if (e.key === 'Tab' && !modal.hidden) {
          var f = Array.prototype.filter.call(hoja.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled; });
          if (!f.length) { e.preventDefault(); hoja.focus(); return; }
          var i = f.indexOf(doc.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
        }
      });
      win.addEventListener('popstate', function () { if (modal._vzAtras > 0) { modal._vzAtras--; return; } modal._vz.cierra(true); });
    } else modal._vz = { cierra: cierra, pon: ponBurbuja, quita: quitaBurbuja, ajusta: ajusta, cercana: cercana, gesto: bajaConGesto, abierto: abierto, explica: explica, alterna: alterna };
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(ajusta);
    return { muestra: muestra, mensaje: mensaje, cierra: cierra, ajusta: ajusta, olvida: olvida };
  }

  var api = { CADA_MS: CADA_MS, eligeHtml: eligeHtml, pinta: pinta, cuadros: cuadros, soloCuadros: soloCuadros, detalleHtml: detalleHtml, monta: monta, fechaCorta: fechaCorta, PRUEBAS: PRUEBAS, estadoPrueba: estadoPrueba, ENDPOINT: ENDPOINT,
    rutasDe: rutasDe, fraseDeducido: fraseDeducido, partesOrigen: partesOrigen, esc: esc, mdp: mdp, ent: ent, num: num, explicaHtml: explicaHtml, pideTexto: pideTexto };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.VisorPPP = api;
  if (!root.document || !root.document.getElementById || !root.document.getElementById('vz')) return;   // sólo la página del visor sigue de aquí

  /* ───────────────────────── la página del visor: por liga, en vivo ───────────────────────── */
  var doc = root.document, lienzo;
  var estado = { liga: '', plan: '', v: 0, llave: '', marcas: null, fallas: 0, reloj: 0, turno: 0, quieto: 0, enVuelo: false };
  function $(id) { return doc.getElementById(id); }
  function ligaDeLaDireccion() {
    var m = /[#&?]l=([A-Za-z0-9_-]{24,80})(?:&|$)/.exec(root.location.hash || '') || /[?&]l=([A-Za-z0-9_-]{24,80})(?:&|$)/.exec(root.location.search || '');
    return m ? m[1] : '';
  }
  /* Un proyecto del árbol, abierto desde su PPP por alguien del equipo: `#p=ppp:arbol-<proyecto>`. No lleva liga: la llave es la
     sesión del Portero de este navegador (sólo se lee) y el servidor decide si alcanza. Sin sesión no se pinta nada. */
  function planDeLaDireccion() {
    var m = /[#&?]p=(ppp:arbol-[a-z0-9]+(?:-[a-z0-9]+)*)(?:&|$)/.exec(root.location.hash || '');
    return m && m[1].length <= 68 ? m[1] : '';
  }
  function equipo() {
    var u = root.navigator.userAgent || '';
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'otro';
  }
  /* La sesión del Portero, si este navegador la tiene: sólo se lee (nunca se borra ni se escribe). Con ella el
     servidor puede reconocer a Dirección y mandarle el selector; el servidor de hoy la ignora. */
  function sesion() { try { var k = root.localStorage.getItem('pyod_clave_v1'); return k && /^[A-Za-z0-9_-]{8,200}$/.test(k) ? k : ''; } catch (e) { return ''; } }
  function pide(extra) {
    var k = sesion();
    var q = '?recurso=ppp2-visor' + (estado.porSesion ? '' : '&liga=' + encodeURIComponent(estado.liga)) + (k ? '&k=' + encodeURIComponent(k) : '') + (estado.plan ? '&plan=' + encodeURIComponent(estado.plan) : '') + (estado.v ? '&v=' + estado.v : '') + (extra || '');
    var ctl = root.AbortController ? new root.AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
    return root.fetch(ENDPOINT + q, { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
  }
  /* La pastilla de arriba dice si la pantalla está al día; lo mismo se anuncia una vez a los lectores de
     pantalla (#vzAviso). «Actualizado» vuelve a «En vivo» a los pocos segundos. */
  var regreso = 0;
  function vivo(clase, texto) {
    var el = $('vzVivo'), aviso = $('vzAviso');
    clearTimeout(regreso);
    if (!el) return;
    el.className = 'vz-vivo' + (clase ? ' ' + clase : '');
    if (texto) el.lastChild.textContent = texto;
    if (aviso && texto && clase) aviso.textContent = texto;
    if (clase === 'vz-nuevo' && !/Abriendo/.test(texto || '')) regreso = setTimeout(function () { var b = $('vzVivo'); if (b && /vz-nuevo/.test(b.className)) { b.className = 'vz-vivo'; b.lastChild.textContent = b.getAttribute('data-base') || 'En vivo'; } }, 8000);
  }
  /* Las pestañas (visor-pestanas.js): Historial, Archivos y Opciones. Si no cargaron, el visor es el de siempre. */
  var P = null;
  function avisaPestanas(que, a, b) { if (P && typeof P[que] === 'function') { try { P[que](a, b); } catch (e) { } } }
  function seApago() {
    estado.liga = ''; clearTimeout(estado.reloj);
    avisaPestanas('apaga');
    lienzo.mensaje('Esta liga ya no está activa', 'Pide una nueva a quien te la compartió.', 'llave');
  }
  function muestra(d, primera) {
    estado.llave = d.llave || '';
    estado.ultimo = d;
    lienzo.muestra(d, estado.marcas, !primera);
    doc.title = ((d.plan && d.plan.nombre) || 'Plan de Potencial') + ' · en vivo';
    avisaPestanas('pinta', d, !!primera);
  }
  function carga(primera) {
    var turno = ++estado.turno;
    return pide(primera ? '&abre=1&eq=' + equipo() : '').then(function (j) {
      if (turno !== estado.turno) return;
      if (!j || !j.ok) {
        if (j && (j.error === 'liga' || j.error === 'plan')) seApago();
        else if (primera) { avisaPestanas('apaga'); lienzo.mensaje('No pude abrir el plan', 'Vuelve a intentar en un momento.', 'falla'); }
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
    if (!estado.liga || doc.hidden || !estado.llave || estado.enVuelo || estado.eligiendo) return;
    var turno = estado.turno;
    estado.enVuelo = true;
    pide('&si=' + encodeURIComponent(estado.llave)).then(function (j) {
      estado.enVuelo = false;
      if (turno !== estado.turno) return;
      if (j && j.ok && j.igual) { estado.fallas = 0; estado.quieto++; if ($('vzVivo') && /vz-off/.test($('vzVivo').className)) { vivo('', $('vzVivo').getAttribute('data-base') || 'En vivo'); if ($('vzAviso')) $('vzAviso').textContent = 'De nuevo en línea'; } return; }
      if (j && j.ok) { estado.fallas = 0; estado.quieto = 0; muestra(j, false); vivo('vz-nuevo', 'Se actualizó · ' + fechaCorta(j.cambio || j.leido)); return; }
      if (j && (j.error === 'liga' || j.error === 'plan')) seApago();
    }).catch(function () { estado.enVuelo = false; if (++estado.fallas >= 2) vivo('vz-off', 'Sin conexión · reintentando'); });
  }
  /* Con la página a la vista pregunta cada CADA_MS; si lleva diez minutos sin cambios ni toques, cada 15 s. */
  function programa() {
    clearTimeout(estado.reloj);
    if (!estado.liga) return;
    estado.reloj = setTimeout(function () { late(); programa(); }, estado.quieto > 600000 / CADA_MS ? 15000 : CADA_MS);
  }
  /* Dirección escoge la versión buena: su pantalla lo dice al instante; si el servidor no lo acepta, vuelve
     atrás y lo dice. Los demás lo ven en el siguiente sondeo, con «Se actualizó». */
  function avisoElige(texto, malo) {
    var m = doc.querySelector('.vz-elige-msg');
    if (m) { m.textContent = texto; m.className = 'vz-elige-msg' + (malo ? ' vz-malo' : ' vz-bien'); }
  }
  function marcaBuena(v) {
    Array.prototype.forEach.call(doc.querySelectorAll('.vz-elige-op'), function (b) {
      var si = v !== null && b.getAttribute('data-elige') === v;
      b.classList.toggle('vz-buena', si); b.setAttribute('aria-checked', si ? 'true' : 'false');
      var i = b.querySelector('i'); if (si && !i) b.insertAdjacentHTML('beforeend', '<i>la buena</i>'); else if (!si && i) i.parentNode.removeChild(i);
    });
  }
  function elige(x) {
    var k = sesion(), d = estado.ultimo || {}, plan = estado.plan || (d.menu && d.menu.plan) || '';
    if (!k || !plan || typeof x.v !== 'string' || estado.eligiendo) return;
    var antes = ((d.elige && d.elige.versiones) || []).filter(function (y) { return y.buena; })[0];
    var etiqueta = '«' + (x.nombre || 'Base') + '»';
    estado.eligiendo = true;
    estado.turno++;   // lo que traiga un sondeo que ya iba en camino ya no se pinta
    marcaBuena(x.v);
    avisoElige('Cambiando… en unos segundos todos verán ' + etiqueta + '.');
    var rid = 'el-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    var ctl = root.AbortController ? new root.AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
    root.fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ tipo: 'ppp2-elige', k: k, plan: plan, v: x.v, request_id: rid }),
      credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        clearTimeout(t);
        if (!j || !j.ok) throw new Error((j && j.error) || 'error');
        estado.v = 0;   // Dirección sigue a la buena, como todos
        var listo = function () { estado.eligiendo = false; marcaBuena(x.v); avisoElige('Listo: todos ven ahora ' + etiqueta + '.'); if ($('vzAviso')) $('vzAviso').textContent = 'Todos ven ahora ' + etiqueta; };
        if (j.version && j.v && j.plan) { muestra(j, false); listo(); return; }
        return carga(false).then(listo, listo);
      })
      .catch(function () {
        clearTimeout(t);
        estado.eligiendo = false;
        marcaBuena(antes ? idElige(antes) : null);
        avisoElige('No se pudo cambiar: todos siguen viendo ' + (antes ? '«' + nombreElige(antes) + '»' : 'la versión de antes') + '. Intenta otra vez.', true);
      });
  }
  /* Escoger otro terreno o versión (los selectores del plan o una tarjeta de «Opciones»). */
  function escoge(x) {
    if (x.plan) { estado.plan = x.plan; estado.v = x.v || 0; } else estado.v = x.v;
    estado.llave = ''; lienzo.olvida(); vivo('vz-nuevo', 'Abriendo…');
    carga(false).catch(function () { vivo('vz-off', 'Sin conexión · reintentando'); });
  }
  /* Lo que las pestañas pueden pedirle a la página. No escriben nada: la única escritura sigue siendo `elige`. */
  var pagina = {
    ENDPOINT: ENDPOINT,
    liga: function () { return estado.liga; },
    plan: function () { var d = estado.ultimo; return estado.plan || (d && d.menu && d.menu.plan) || ''; },
    datos: function () { return estado.ultimo || null; },
    escoge: escoge,
    elige: elige,
    ajusta: function () { if (lienzo) lienzo.ajusta(); },
    confirma: function () { if (estado.liga && !estado.enVuelo) late(); },   // un recurso de las pestañas dijo «liga»: el sondeo lo confirma
    aviso: function (t) { var a = $('vzAviso'); if (a && t) a.textContent = t; }
  };
  function arranca() {
    estado.liga = ligaDeLaDireccion();
    if (!estado.liga) { var deSesion = planDeLaDireccion(); if (deSesion && sesion()) { estado.porSesion = true; estado.liga = 'sesion'; estado.plan = deSesion; } }
    if (estado.liga && !estado.porSesion && root.VisorPestanas && typeof root.VisorPestanas.monta === 'function') { try { P = root.VisorPestanas.monta(pagina); } catch (e) { P = null; } }
    lienzo = monta($('vz'), { alElegir: elige, alEscoger: escoge, sinElige: !!P });
    if (!estado.liga) { lienzo.mensaje('Falta la liga', 'Abre el visor desde la liga completa que te compartieron.', 'llave'); return; }
    if (!$('vzEsq')) lienzo.mensaje('Abriendo el plan…', 'Leyendo el libro.');   // el esqueleto de visor.html ya dice «abriendo»
    carga(true).catch(function () { avisaPestanas('apaga'); lienzo.mensaje('No pude abrir el plan', 'Revisa tu conexión y vuelve a intentar.', 'falla'); });
    root.addEventListener('offline', function () { vivo('vz-off', 'Sin conexión · reintentando'); });
    root.addEventListener('online', function () { estado.quieto = 0; late(); });
    programa();
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) { estado.quieto = 0; late(); programa(); } });
    doc.addEventListener('pointerdown', function () { estado.quieto = 0; }, true);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', arranca); else arranca();
})(typeof window !== 'undefined' ? window : globalThis);
