/* Árbol PPP · MOTOR REAL (D7 v1.2).
   Módulo puro, sin dependencias, sin red, sin reloj para calcular (solo para el tope de tiempo de las sugerencias),
   sin eval ni Function. Sirve en el navegador y en Node (UMD).

   Contrato hacia afuera (D7 Anexo B): carga, evalua, sugiere, compara. Cosas nuevas que se agregan sin tocar el contrato:
   paqueteVisor (paquete «ppp2-visor-v1», D9 §3/§10), valida (alias de carga que solo devuelve el diagnóstico),
   planConCambio (el plan que debe guardar la pantalla después de una acción) y analiza/evaluaExpresion (para el editor).
   SPPP · T-10 (copia de prueba del módulo de repartos, sólo vertical en venta): carga(definición, { extension: definicion/reparto.json })
   agrega S-12, S-13, S-17 a S-24 y R-26 a R-35; registraReparto(módulo) recibe reparto.js (en el navegador basta cargarlo antes);
   reparto(definición, plan) devuelve el caso, los parámetros y el resultado; la tarjeta «Reparto» y el paquete traen el bloque «cascada».
   Corrección 1 (dictamen T-11): planConOpcion(definición, plan, 'A'|'B'|'C') aplica al plan la estructura de P-02 (S-24, S-03, S-05 y D-01) y F-02
   se recalcula; extiende(entrada, extensión) arma la definición extendida para la página de prueba (reparto-prueba.html). SIN la extensión,
   la tarjeta y el paquete quedan idénticos a los del commit base.

   Convenciones (resumen; el detalle está en D-motor-notas.md):
   - Desconocido = null (lógica de tres valores). Solo un «verdadero» activa algo.
   - Dentro del motor un ID vale el valor del FACTOR (pesos, m², fracciones, meses). La referencia, el rango y los valores de
     opciones se escriben en unidades de la VISTA solo si el nodo declara `vista`; si no, en unidades del factor (dinero en pesos).
   - En plan.valores y en cambio, `valor` va en unidades de la VISTA (millones si el nodo tiene `escala`, fracción si es %).
   - Todo lo que sale es vista previa: «estimado, no sincronizado».
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArbolMotor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROTULO = 'estimado, no sincronizado';
  const VERSION_MOTOR = 'motor-real-1.4.0';
  const TARJETAS = ['Reparto', 'Terreno', 'Producto', 'Tiempo', 'Costo y ganancia', 'Dinero', 'Riesgo y estado'];
  const TIPOS_NODO = ['se_decide', 'se_busca', 'regla_oficio', 'calculado'];
  const CLASES_UNIDAD = ['m2', 'pct', 'mxn', 'mxn_m2', 'n', 'n1', 'veces', 'mes', 'u_mes', 'texto', 'si_no'];
  const MAX_EXPR = 500, MAX_PROF = 12, MAX_SIMB = 60, MAX_VARIANTES = 8;
  const CAMPOS = ['valor', 'estado', 'opcion', 'ref', 'min', 'max'];
  const FUNCIONES = {
    definido: [1, 1], firme: [1, 1], pendiente: [1, 1], min: [1, 12], max: [1, 12], abs: [1, 1], piso: [1, 1], techo: [1, 1],
    redondea: [2, 2], si: [3, 3], suma_tipos: [1, 1], suma_tipos_si: [3, 3], cuenta_pendientes: [0, 0], flujo: [2, 3],
    fuentes_difieren: [1, 1], suma_componentes: [2, 2], cuenta_componentes: [2, 2], componente: [3, 3], esnumero: [1, 1],
    fallas_revision: [0, 0], resultado_revision: [0, 0]
  };
  const PALABRAS = new Set(['y', 'o', 'no', 'en', 'verdadero', 'falso']);

  /* ───── utilidades ───── */
  const esNum = (x) => typeof x === 'number' && isFinite(x);
  const nn = (x) => (x === undefined || (typeof x === 'number' && !isFinite(x)) ? null : x);
  const clonar = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const ahora = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  function canonico(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o === undefined ? null : o);
    if (Array.isArray(o)) return '[' + o.map(canonico).join(',') + ']';
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonico(o[k])).join(',') + '}';
  }
  function huella53(s) {   // cyrb53: huella estable de 53 bits, en hexadecimal
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }
  /* Redondeo de Excel (mitad hacia arriba, lejos de cero); el 1e-9 esquiva el error de coma flotante, como el prototipo. */
  function redondeaExcel(x, n) {
    const f = Math.pow(10, n || 0), s = x < 0 ? -1 : 1;
    return s * Math.floor(Math.abs(x) * f + 0.5 + 1e-9) / f;
  }
  function miles(x, dec) {
    const neg = x < 0; x = Math.abs(x);
    const s = x.toFixed(dec), p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + p.join('.');
  }
  const noEs = (x) => x === null || x === undefined;

  /* ───── analizador de expresiones (gramática de D7 §4.2) ───── */
  function errExpr(m, pos) { const e = new Error(m); e.expr = true; e.pos = pos; throw e; }

  function tokeniza(src, permiteV) {
    const t = []; let i = 0; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === "'") {
        const j = src.indexOf("'", i + 1);
        if (j < 0) errExpr('Falta cerrar la comilla del texto.', i);
        t.push({ k: 'str', v: src.slice(i + 1, j), p: i }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c)) {
        const m = /^\d+(\.\d+)?/.exec(src.slice(i));
        let j = i + m[0].length, v = parseFloat(m[0]);
        if (src[j] === '%') { v = v / 100; j++; }
        t.push({ k: 'num', v, p: i }); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)); const w = m[0]; let j = i + w.length;
        let sig = j; while (sig < n && src[sig] === ' ') sig++;
        if (PALABRAS.has(w)) { t.push({ k: 'kw', v: w, p: i }); i = j; continue; }
        if (src[sig] === '(') { t.push({ k: 'name', v: w, p: i }); i = j; continue; }
        if (src[j] === '-' && /[0-9]/.test(src[j + 1] || '') && /^[A-Za-z]+[0-9]*$/.test(w)) {
          let k = j + 1; while (k < n && /[0-9]/.test(src[k])) k++;
          if (/[a-z]/.test(w)) {
            if (permiteV && w === 'v') { t.push({ k: 'name', v: w, p: i }); i = j; continue; }   // «v-1»: la variable menos 1
            errExpr('El ID «' + w + src.slice(j, k) + '» va en mayúsculas: los IDs se escriben como T-01.', i);
          }
          t.push({ k: 'id', v: w + src.slice(j, k), p: i }); i = k; continue;
        }
        t.push({ k: 'name', v: w, p: i }); i = j; continue;
      }
      const dos = src.slice(i, i + 2);
      if (dos === '!=' || dos === '<=' || dos === '>=') { t.push({ k: 'op', v: dos, p: i }); i += 2; continue; }
      if ('+-*/^(),[]=<>.'.indexOf(c) >= 0) { t.push({ k: 'op', v: c, p: i }); i++; continue; }
      errExpr('No entiendo el signo «' + c + '» (posición ' + (i + 1) + ').', i);
    }
    return t;
  }

  function parsea(src, permiteV) {
    if (typeof src !== 'string') errExpr('La expresión no es texto.');
    if (src.length > MAX_EXPR) errExpr('La expresión pasa de ' + MAX_EXPR + ' caracteres.');
    const tk = tokeniza(src, permiteV); let p = 0;
    const ver = () => tk[p];
    const esOp = (v) => tk[p] && tk[p].k === 'op' && tk[p].v === v;
    const esKw = (v) => tk[p] && tk[p].k === 'kw' && tk[p].v === v;
    const toma = (v) => { if (!esOp(v)) errExpr('Se esperaba «' + v + '»' + (tk[p] ? ' y se encontró «' + tk[p].v + '».' : ' y se acabó la expresión.')); p++; };
    function disy() { let a = conj(); while (esKw('o')) { p++; a = { t: 'o', a, b: conj() }; } return a; }
    function conj() { let a = nega(); while (esKw('y')) { p++; a = { t: 'y', a, b: nega() }; } return a; }
    function nega() {
      if (esKw('no') && !(tk[p + 1] && tk[p + 1].k === 'kw' && tk[p + 1].v === 'en')) { p++; return { t: 'no', x: nega() }; }
      return compar();
    }
    function compar() {
      const a = suma();
      const x = ver();
      if (x && x.k === 'op' && ['=', '!=', '<', '<=', '>', '>='].indexOf(x.v) >= 0) { p++; return { t: 'cmp', op: x.v, a, b: suma() }; }
      let neg = false;
      if (esKw('no') && tk[p + 1] && tk[p + 1].k === 'kw' && tk[p + 1].v === 'en') { neg = true; p++; }
      if (esKw('en')) {
        p++; toma('['); const lista = [];
        for (;;) {
          const l = ver();
          if (!l) errExpr('Falta cerrar la lista con «]».');
          if (l.k === 'num' || l.k === 'str') { lista.push(l.v); p++; }
          else if (l.k === 'op' && l.v === '-' && tk[p + 1] && tk[p + 1].k === 'num') { lista.push(-tk[p + 1].v); p += 2; }
          else errExpr('En una lista solo caben números y textos.');
          if (esOp(',')) { p++; continue; }
          break;
        }
        toma(']'); return { t: 'en', neg, a, lista };
      }
      return a;
    }
    function suma() {
      let a = prod();
      while (esOp('+') || esOp('-')) { const op = tk[p].v; p++; a = { t: 'bin', op, a, b: prod() }; }
      return a;
    }
    function prod() {
      let a = pot();
      while (esOp('*') || esOp('/')) { const op = tk[p].v; p++; a = { t: 'bin', op, a, b: pot() }; }
      return a;
    }
    function pot() {
      const a = unario();
      if (esOp('^')) {
        p++; const e = ver();
        if (!e || e.k !== 'num' || Math.floor(e.v) !== e.v) errExpr('Después de «^» va un número entero.');
        p++; return { t: 'pot', a, n: e.v };
      }
      return a;
    }
    function unario() { if (esOp('-')) { p++; return { t: 'neg', x: unario() }; } return prim(); }
    function prim() {
      const x = ver();
      if (!x) errExpr('La expresión está incompleta.');
      if (x.k === 'num') { p++; return { t: 'num', v: x.v }; }
      if (x.k === 'str') { p++; return { t: 'str', v: x.v }; }
      if (x.k === 'kw' && (x.v === 'verdadero' || x.v === 'falso')) { p++; return { t: 'bool', v: x.v === 'verdadero' }; }
      if (x.k === 'id') {
        p++; let campo = 'valor';
        if (esOp('.') && tk[p + 1] && tk[p + 1].k === 'name') {
          if (CAMPOS.indexOf(tk[p + 1].v) < 0) errExpr('«' + tk[p + 1].v + '» no es un campo válido (valor, estado, opcion, ref, min, max).');
          campo = tk[p + 1].v; p += 2;
        }
        return { t: 'ref', id: x.v, campo };
      }
      if (x.k === 'name') {
        if (permiteV && x.v === 'v' && !(tk[p + 1] && tk[p + 1].k === 'op' && tk[p + 1].v === '(')) { p++; return { t: 'var' }; }
        if (!(tk[p + 1] && tk[p + 1].k === 'op' && tk[p + 1].v === '(')) errExpr('«' + x.v + '» no es un ID ni una función (los IDs se escriben como T-01).');
        if (!Object.prototype.hasOwnProperty.call(FUNCIONES, x.v)) errExpr('La función «' + x.v + '» no existe en la lista permitida.');
        p += 2; const args = [];
        if (!esOp(')')) { for (;;) { args.push(disy()); if (esOp(',')) { p++; continue; } break; } }
        toma(')');
        const [mn, mx] = FUNCIONES[x.v];
        if (args.length < mn || args.length > mx) errExpr('«' + x.v + '» pide ' + (mn === mx ? mn : 'entre ' + mn + ' y ' + mx) + ' argumento(s) y trae ' + args.length + '.');
        return { t: 'call', f: x.v, args };
      }
      if (x.k === 'op' && x.v === '(') { p++; const a = disy(); toma(')'); return a; }
      errExpr('No esperaba «' + x.v + '» en la posición ' + (x.p + 1) + '.');
    }
    if (!tk.length) errExpr('La expresión está vacía.');
    const ast = disy();
    if (p < tk.length) errExpr('Sobra «' + tk[p].v + '» al final de la expresión.');
    return ast;
  }

  /* Recorre un AST: IDs, funciones, flujos y profundidad (los límites de D7 §4.1). */
  function analizaAst(ast) {
    const ids = new Set(), refs = [], funcs = new Set(), flujos = new Set();
    let prof = 0;
    (function rec(a, d) {
      if (d > prof) prof = d;
      switch (a.t) {
        case 'ref': ids.add(a.id); refs.push(a); break;
        case 'call':
          funcs.add(a.f);
          if (a.f === 'flujo' && a.args[0].t === 'ref') { flujos.add(a.args[0].id); ids.delete(a.args[0].id); refs.pop(); }
          a.args.forEach((x, i) => { if (a.f === 'flujo' && i === 0) return; rec(x, d + 1); });
          break;
        case 'bin': rec(a.a, a.a.t === 'bin' && a.a.op === a.op ? d : d + 1); rec(a.b, d + 1); break;
        case 'y': case 'o': rec(a.a, a.a.t === a.t ? d : d + 1); rec(a.b, d + 1); break;
        case 'cmp': rec(a.a, d + 1); rec(a.b, d + 1); break;
        case 'en': rec(a.a, d + 1); break;
        case 'no': case 'neg': rec(a.x, d + 1); break;
        case 'pot': rec(a.a, d + 1); break;
        default: break;
      }
    })(ast, 1);
    return { ids, refs, funcs, flujos, prof };
  }

  /* Dependencias (con tipo) que una expresión crea. `ctx` = {tipos: [índices de tipología], rv: [IDs de las pruebas], flujo(id)->[IDs], comp(id)->[IDs]}. */
  function depsDeAst(ast, ctx, propio) {
    const out = [];
    (function rec(a) {
      switch (a.t) {
        case 'ref': out.push(a.id); break;
        case 'call': {
          if (a.f === 'suma_tipos' && a.args[0].t === 'str') ctx.tipologias().forEach((i) => out.push('P' + i + '-' + a.args[0].v));
          else if (a.f === 'suma_tipos_si' && a.args[0].t === 'str' && a.args[1].t === 'str') ctx.tipologias().forEach((i) => { out.push('P' + i + '-' + a.args[0].v); out.push('P' + i + '-' + a.args[1].v); });
          else if (a.f === 'flujo' && a.args[0].t === 'ref') ctx.flujo(a.args[0].id).forEach((x) => out.push(x));
          else if ((a.f === 'fallas_revision' || a.f === 'resultado_revision')) ctx.rv().forEach((x) => out.push(x));
          else if ((a.f === 'suma_componentes' || a.f === 'cuenta_componentes' || a.f === 'componente') && a.args[0].t === 'str') {
            const nid = a.args[0].v;
            if (nid === propio) ctx.comp(nid).forEach((x) => out.push(x)); else out.push(nid);
          } else if (a.f === 'fuentes_difieren') { /* sin dependencias extra: lee el estado del nodo */ }
          a.args.forEach((x, i) => { if (a.f === 'flujo' && i === 0) return; rec(x); });
          break;
        }
        case 'bin': case 'cmp': case 'y': case 'o': rec(a.a); rec(a.b); break;
        case 'en': rec(a.a); break;
        case 'no': case 'neg': rec(a.x); break;
        case 'pot': rec(a.a); break;
        default: break;
      }
    })(ast);
    return out;
  }

  /* ───── compilador a funciones (sin eval) ───── */
  const IGUAL = (a, b) => (esNum(a) && esNum(b) ? Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);

  function compila(a, C) {
    switch (a.t) {
      case 'num': case 'str': case 'bool': { const v = a.v; return () => v; }
      case 'var': return (E) => (E.vv === undefined ? null : E.vv);
      case 'ref': {
        const i = C.ix.get(a.id);
        if (i === undefined) { C.faltan.add(a.id); return () => null; }
        switch (a.campo) {
          case 'valor': return (E) => { const x = E.v[i]; return x === undefined ? null : x; };
          case 'estado': return (E) => E.est[i] || null;
          case 'opcion': return (E) => E.opc[i] || null;
          case 'ref': return (E) => nn(E.rf[i]);
          case 'min': return (E) => nn(E.mn[i]);
          default: return (E) => nn(E.mx[i]);
        }
      }
      case 'neg': { const f = compila(a.x, C); return (E) => { const x = f(E); return esNum(x) ? -x : null; }; }
      case 'pot': { const f = compila(a.a, C), n = a.n; return (E) => { const x = f(E); if (!esNum(x)) return null; const r = Math.pow(x, n); return isFinite(r) ? r : null; }; }
      case 'bin': {
        const fa = compila(a.a, C), fb = compila(a.b, C);
        switch (a.op) {
          case '+': return (E) => { const x = fa(E), y = fb(E); if (!esNum(x) || !esNum(y)) return null; const r = x + y; return isFinite(r) ? r : null; };
          case '-': return (E) => { const x = fa(E), y = fb(E); if (!esNum(x) || !esNum(y)) return null; const r = x - y; return isFinite(r) ? r : null; };
          case '*': return (E) => { const x = fa(E), y = fb(E); if (!esNum(x) || !esNum(y)) return null; const r = x * y; return isFinite(r) ? r : null; };
          default: return (E) => { const x = fa(E), y = fb(E); if (!esNum(x) || !esNum(y) || y === 0) return null; const r = x / y; return isFinite(r) ? r : null; };
        }
      }
      case 'cmp': {
        const fa = compila(a.a, C), fb = compila(a.b, C), op = a.op;
        return (E) => {
          const x = fa(E), y = fb(E);
          if (noEs(x) || noEs(y)) return null;
          if (op === '=') return typeof x === typeof y ? IGUAL(x, y) : false;
          if (op === '!=') return typeof x === typeof y ? !IGUAL(x, y) : true;
          if (typeof x !== typeof y || (typeof x !== 'number' && typeof x !== 'string')) return null;
          if (op === '<') return x < y; if (op === '<=') return x <= y; if (op === '>') return x > y; return x >= y;
        };
      }
      case 'en': {
        const fa = compila(a.a, C), lista = a.lista, neg = a.neg;
        return (E) => { const x = fa(E); if (noEs(x)) return null; const r = lista.some((l) => typeof l === typeof x && IGUAL(l, x)); return neg ? !r : r; };
      }
      case 'y': {
        const fa = compila(a.a, C), fb = compila(a.b, C);
        return (E) => { const x = fa(E); if (x === false) return false; const y = fb(E); if (y === false) return false; return x === true && y === true ? true : null; };
      }
      case 'o': {
        const fa = compila(a.a, C), fb = compila(a.b, C);
        return (E) => { const x = fa(E); if (x === true) return true; const y = fb(E); if (y === true) return true; return x === false && y === false ? false : null; };
      }
      case 'no': { const f = compila(a.x, C); return (E) => { const x = f(E); return x === true ? false : x === false ? true : null; }; }
      case 'call': return compilaLlamada(a, C);
      default: throw new Error('Nodo de sintaxis desconocido: ' + a.t);
    }
  }

  function compilaLlamada(a, C) {
    const f = a.f, args = a.args;
    const idxArg = (k) => (args[k].t === 'ref' ? C.ix.get(args[k].id) : undefined);
    if (f === 'definido' || f === 'firme' || f === 'pendiente') {
      if (args[0].t !== 'ref') throw new Error('«' + f + '» pide un ID.');
      const i = idxArg(0); if (i === undefined) { C.faltan.add(args[0].id); return () => false; }
      if (f === 'definido') return (E) => E.v[i] != null;
      if (f === 'firme') return (E) => E.v[i] != null && (E.est[i] === 'decidido' || E.est[i] === 'confirmado');
      return (E) => E.v[i] != null && (E.est[i] === 'referencia' || E.est[i] === 'no_se' || E.est[i] === 'reabierto');
    }
    if (f === 'fuentes_difieren') {
      if (args[0].t !== 'ref') throw new Error('«fuentes_difieren» pide un ID.');
      const i = idxArg(0); if (i === undefined) { C.faltan.add(args[0].id); return () => false; }
      return (E) => E.fuentesDifieren(i);
    }
    if (f === 'cuenta_pendientes') return (E) => E.cuentaPendientes();
    if (f === 'fallas_revision') return (E) => E.fallasRevision();
    if (f === 'resultado_revision') return (E) => E.resultadoRevision();
    if (f === 'esnumero') { const g = compila(args[0], C); return (E) => esNum(g(E)); }
    if (f === 'si') {
      const c = compila(args[0], C), x = compila(args[1], C), y = compila(args[2], C);
      return (E) => { const k = c(E); if (k === true) return x(E); if (k === false) return y(E); return null; };
    }
    if (f === 'suma_tipos' || f === 'suma_tipos_si') {
      if (args[0].t !== 'str' || (f === 'suma_tipos_si' && (args[1].t !== 'str'))) throw new Error('«' + f + '» pide textos entre comillas simples.');
      const suf = args[0].v, filtro = f === 'suma_tipos_si' ? args[1].v : null;
      const val = f === 'suma_tipos_si' ? compila(args[2], C) : null;
      const pares = [];
      C.tipologias().forEach((i) => {
        const a1 = C.ix.get('P' + i + '-' + suf); if (a1 === undefined) return;
        if (filtro == null) pares.push([a1, -1]); else { const a2 = C.ix.get('P' + i + '-' + filtro); if (a2 !== undefined) pares.push([a1, a2]); }
      });
      return (E) => {
        let s = 0, hay = false; const want = val ? val(E) : null;
        for (let k = 0; k < pares.length; k++) {
          const x = E.v[pares[k][0]]; if (!esNum(x)) continue;
          if (pares[k][1] >= 0) { const y = E.v[pares[k][1]]; if (noEs(y) || !IGUAL(y, want)) continue; }
          s += x; hay = true;
        }
        return hay ? s : null;
      };
    }
    if (f === 'suma_componentes' || f === 'cuenta_componentes' || f === 'componente') {
      if (args[0].t !== 'str' || args[1].t !== 'str') throw new Error('«' + f + '» pide textos entre comillas simples.');
      const nid = args[0].v, i = C.ix.get(nid);
      if (i === undefined) { C.faltan.add(nid); return () => null; }
      const a1 = args[1].v, a2 = f === 'componente' ? args[2].v : null;
      if (f === 'suma_componentes') return (E) => E.sumaComp(i, a1);
      if (f === 'cuenta_componentes') return (E) => E.cuentaComp(i, a1);
      return (E) => E.compCampo(i, a1, a2);
    }
    if (f === 'flujo') {
      if (args[0].t !== 'ref' || args[1].t !== 'str') throw new Error('«flujo» pide un ID de flujo y la medida entre comillas.');
      const fid = args[0].id, medida = args[1].v, arg = args[2] ? compila(args[2], C) : null;
      return (E) => E.flujo(fid, medida, arg ? arg(E) : undefined);
    }
    const fs = args.map((x) => compila(x, C));
    switch (f) {
      case 'min': return (E) => { let m = Infinity; for (let k = 0; k < fs.length; k++) { const x = fs[k](E); if (!esNum(x)) return null; if (x < m) m = x; } return m; };
      case 'max': return (E) => { let m = -Infinity; for (let k = 0; k < fs.length; k++) { const x = fs[k](E); if (!esNum(x)) return null; if (x > m) m = x; } return m; };
      case 'abs': return (E) => { const x = fs[0](E); return esNum(x) ? Math.abs(x) : null; };
      case 'piso': return (E) => { const x = fs[0](E); return esNum(x) ? Math.floor(x) : null; };
      case 'techo': return (E) => { const x = fs[0](E); return esNum(x) ? Math.ceil(x) : null; };
      case 'redondea': return (E) => { const x = fs[0](E), n = fs[1](E); return esNum(x) && esNum(n) ? redondeaExcel(x, n) : null; };
      default: throw new Error('Función sin implementar: ' + f);
    }
  }

  /* ───── celdas con código (variantes, D7 §13) ───── */
  function separaTop(texto, sep) {
    const out = []; let nivel = 0, q = false, ini = 0;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === "'") q = !q;
      else if (!q) {
        if (c === '(' || c === '[') nivel++; else if (c === ')' || c === ']') nivel--;
        else if (c === sep && nivel === 0) { out.push(texto.slice(ini, i)); ini = i + 1; }
      }
    }
    out.push(texto.slice(ini));
    return out;
  }
  function primerIgualTop(texto) {
    let nivel = 0, q = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === "'") q = !q;
      else if (!q) {
        if (c === '(' || c === '[') nivel++; else if (c === ')' || c === ']') nivel--;
        else if (c === '=' && nivel === 0 && texto[i + 1] !== '=') return i;
      }
    }
    return -1;
  }
  const bareSiNo = (t) => (t === 'si' || t === 'no' ? "'" + t + "'" : t);

  /* Devuelve {texto, base:{ast,texto}, vars:[{sel:[[etiquetas]], n, ast, texto}]} o lanza error de expresión. */
  function parseCelda(raw, opts) {
    opts = opts || {};
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return { texto: String(raw), base: { ast: { t: 'num', v: raw }, texto: String(raw) }, vars: [] };
    if (typeof raw === 'boolean') return { texto: String(raw), base: { ast: { t: 'bool', v: raw }, texto: String(raw) }, vars: [] };
    const texto = String(raw).trim(); if (texto === '') return null;
    if (texto.length > MAX_EXPR) errExpr('La celda pasa de ' + MAX_EXPR + ' caracteres.');
    const partes = separaTop(texto, '|').map((s) => s.trim());
    if (partes.length > 1 && opts.sinVariantes) errExpr('Esta columna no admite variantes (el signo «|» solo vale en las columnas de números y referencias).');
    if (partes.length - 1 > MAX_VARIANTES) errExpr('Hay más de ' + MAX_VARIANTES + ' variantes en la celda.');
    const un = (s) => { const t = opts.bareSiNo ? bareSiNo(s) : s; return { ast: parsea(t, opts.permiteV), texto: s }; };
    const base = un(partes[0]), vars = [];
    for (let k = 1; k < partes.length; k++) {
      const seg = partes[k], j = primerIgualTop(seg);
      if (j < 0) errExpr('La variante «' + seg + '» necesita un «=» (por ejemplo V2 = 4.7%).');
      const selTxt = seg.slice(0, j).trim(), val = seg.slice(j + 1).trim();
      if (!/^[A-Za-z0-9_,+\s]+$/.test(selTxt)) errExpr('El selector «' + selTxt + '» no es válido (use V1, un tipo o un escenario).');
      const sel = selTxt.split('+').map((g) => g.split(',').map((e) => e.trim()).filter(Boolean));
      if (sel.some((g) => !g.length)) errExpr('El selector «' + selTxt + '» está incompleto.');
      const v = un(val); v.sel = sel; v.n = sel.length; v.selTxt = selTxt; vars.push(v);
    }
    return { texto, base, vars };
  }
  function compilaCelda(cel, C) {
    if (!cel) return null;
    cel.f0 = compila(cel.base.ast, C);
    cel.vars.forEach((v) => { v.f = compila(v.ast, C); });
    return cel;
  }
  function cumpleSel(sel, ctx) {
    return sel.every((g) => g.some((e) => e === ctx.version || e === ctx.escenario || e === ctx.tipo));
  }
  function elige(cel, ctx) {
    if (!cel) return null;
    if (!cel.vars.length) return cel.f0;
    let mejor = null;
    for (let k = 0; k < cel.vars.length; k++) {
      const v = cel.vars[k];
      if (cumpleSel(v.sel, ctx) && (!mejor || v.n > mejor.n)) mejor = v;
    }
    return mejor ? mejor.f : cel.f0;
  }
  function eligeAst(cel, ctx) {
    if (!cel) return null;
    let mejor = null;
    for (let k = 0; k < cel.vars.length; k++) { const v = cel.vars[k]; if (cumpleSel(v.sel, ctx) && (!mejor || v.n > mejor.n)) mejor = v; }
    return mejor ? mejor.ast : cel.base.ast;
  }
  const E_VACIO = { v: [], est: [], opc: [], rf: [], mn: [], mx: [] };
  function constanteDe(f) { try { const x = f(E_VACIO); return x; } catch (e) { return null; } }


  /* ═════════════════════════ CARGA: normalización de la definición ═════════════════════════ */
  const T = (x) => (x === null || x === undefined ? '' : String(x).trim());
  const LISTA = (x) => (Array.isArray(x) ? x.map(T).filter(Boolean) : T(x).split(';').map((s) => s.trim()).filter(Boolean));
  const SI = (x) => x === true || /^(si|sí|true|1)$/i.test(T(x));
  const NUM = (x) => { if (x === null || x === undefined || T(x) === '') return null; const n = Number(String(x).replace(/%$/, '')); return isFinite(n) ? (/%$/.test(T(x)) ? n / 100 : n) : null; };
  const ENTERO = (x) => { const n = NUM(x); return n === null ? null : Math.round(n); };

  const COLUMNAS = {
    ARBOL_NODOS: ['id', 'modulo', 'tipo', 'titulo', 'tarjetas', 'de', 'raiz', 'usa', 'unidad_clase', 'unidad_etiqueta', 'unidad_escala', 'que_es', 'pregunta', 'etiqueta_resultado', 'referencia_valor', 'referencia_opcion', 'referencia_origen', 'rango_min', 'rango_max', 'rango_paso', 'permite_otro', 'confirma_en', 'formula', 'motor', 'aparece', 'vista_a_factor', 'vista_de_factor', 'lista', 'sentido', 'umbral', 'explica', 'orden', 'prioridad', 'oculto', 'pregunta_ppp40', 'version', 'mercado_dato', 'compuesto'],
    ARBOL_OPCIONES: ['nodo', 'clave', 'nombre', 'implica', 'valor', 'escribe', 'solo_si', 'orden', 'componentes', 'fuente', 'fecha_fuente', 'por_omision'],
    ARBOL_REGLAS: ['id', 'nodo', 'clase', 'cuando', 'accion', 'objetivo', 'valor', 'nivel', 'texto', 'sobre', 'orden', 'palancas', 'medida', 'meta', 'pasa_si', 'sugiere', 'texto_sugerencia', 'texto_cierre'],
    ARBOL_FACTORES: ['id', 'nombre', 'unidad_maestro', 'origen_maestro', 'tarjeta', 'campo_visor', 'conversion_visor', 'hoja_libro', 'clave_libro', 'clave_prototipo', 'correspondencia', 'nota', 'etiqueta_corta', 'orden_tarjeta', 'minimo_tarjeta'],
    ARBOL_COMPONENTES: ['nodo', 'clave', 'nombre', 'rol', 'unidad_base', 'cantidad', 'm2_por_unidad', 'base', 'min', 'max', 'paso', 'activo_ref', 'fuente', 'nota', 'orden', 'version'],
    ARBOL_TIPOS: ['id', 'nombre', 'max_abiertas', 'modulos', 'version', 'max_sugerencias', 'tope_corridas', 'tope_ms'],
    ARBOL_FLUJOS: ['flujo', 'concepto', 'signo', 'monto', 'perfil', 'desde', 'hasta', 'parametros'],
    ARBOL_LISTAS: ['lista', 'valor', 'nombre'],
    ARBOL_VERSIONES: ['version', 'huella', 'quien', 'fecha', 'resultado_validacion', 'nota']
  };
  const OBLIGATORIAS = {   // columnas de v1.1 (las de v1.2 pueden faltar: se aceptan vacías, Anexo A convención 10)
    ARBOL_NODOS: ['id', 'modulo', 'tipo', 'titulo', 'tarjetas', 'de', 'unidad_clase', 'unidad_etiqueta', 'que_es', 'version'],
    ARBOL_OPCIONES: ['nodo', 'clave', 'nombre', 'implica', 'valor'],
    ARBOL_REGLAS: ['id', 'nodo', 'clase'],
    ARBOL_FACTORES: ['id', 'nombre', 'unidad_maestro', 'origen_maestro', 'correspondencia'],
    ARBOL_COMPONENTES: ['nodo', 'clave', 'nombre', 'rol', 'unidad_base', 'cantidad', 'min', 'max', 'paso', 'activo_ref', 'version'],
    ARBOL_TIPOS: ['id', 'nombre', 'max_abiertas', 'modulos', 'version'],
    ARBOL_FLUJOS: ['flujo', 'concepto', 'perfil'],
    ARBOL_LISTAS: ['lista', 'valor'],
    ARBOL_VERSIONES: ['version', 'huella', 'quien', 'fecha', 'resultado_validacion']
  };
  const NOMBRES_TABLA = { nodos: 'ARBOL_NODOS', opciones: 'ARBOL_OPCIONES', reglas: 'ARBOL_REGLAS', factores: 'ARBOL_FACTORES', componentes: 'ARBOL_COMPONENTES', tipos: 'ARBOL_TIPOS', flujos: 'ARBOL_FLUJOS', listas: 'ARBOL_LISTAS', versiones: 'ARBOL_VERSIONES' };

  function parseParametros(txt) {
    const o = {}; if (!T(txt)) return o;
    T(txt).split(';').forEach((p) => { const j = p.indexOf('='); if (j > 0) o[p.slice(0, j).trim()] = p.slice(j + 1).trim(); });
    return o;
  }

  /* De tablas en filas (Anexo A) al formato canónico (el mismo de vertical.json). Anota errores de columnas. */
  function desdeTablas(tablas, errores) {
    const cr = { tipo: null, nodos: [], componentes: [], factores: [], flujos: [], listas: [], versiones: [], fuente: 'tablas' };
    const tab = {};
    Object.keys(tablas).forEach((k) => {
      const nombre = COLUMNAS[k] ? k : (COLUMNAS[k.toUpperCase()] ? k.toUpperCase() : (NOMBRES_TABLA[k.toLowerCase()] || null));
      if (nombre && Array.isArray(tablas[k])) tab[nombre] = tablas[k];
    });
    /* lo que sale de Sheets (getValues) es una matriz con encabezado: se vuelve filas con nombre */
    Object.keys(tab).forEach((nombre) => {
      const f = tab[nombre];
      if (f.length && Array.isArray(f[0])) { const cab = f[0].map((x) => T(x)); tab[nombre] = f.slice(1).filter((r) => r.some((x) => T(x) !== '')).map((r) => { const o = {}; cab.forEach((c, i) => { if (c) o[c] = r[i] === undefined ? '' : r[i]; }); return o; }); }
    });
    Object.keys(COLUMNAS).forEach((nombre) => {
      const filas = tab[nombre];
      if (!filas) { if (['ARBOL_NODOS'].indexOf(nombre) >= 0) errores.push({ pestana: nombre, fila: 1, columna: '', codigo: 'columna_faltante', mensaje: 'Falta la pestaña ' + nombre + '.' }); return; }
      const cabeza = {}; filas.forEach((f) => Object.keys(f).forEach((c) => { cabeza[c] = true; }));
      if (filas.length) {
        (OBLIGATORIAS[nombre] || []).forEach((c) => { if (!cabeza[c]) errores.push({ pestana: nombre, fila: 1, columna: c, codigo: 'columna_faltante', mensaje: 'Falta la columna «' + c + '» en ' + nombre + '.' }); });
        Object.keys(cabeza).forEach((c) => { if (COLUMNAS[nombre].indexOf(c) < 0) errores.push({ pestana: nombre, fila: 1, columna: c, codigo: 'columna_desconocida', mensaje: 'La columna «' + c + '» no existe en ' + nombre + ' (se rechaza: revise el nombre o la lista de columnas del Anexo A).' }); });
      }
    });
    const nodos = tab.ARBOL_NODOS || [];
    nodos.forEach((r, k) => {
      const n = {
        _fila: k + 2, id: T(r.id), modulo: T(r.modulo), tipo: T(r.tipo), titulo: T(r.titulo), tarjetas: LISTA(r.tarjetas), de: T(r.de) || null,
        raiz: SI(r.raiz), usa: LISTA(r.usa),
        unidad: { clase: T(r.unidad_clase), etiqueta: T(r.unidad_etiqueta) }, que_es: T(r.que_es), pregunta: T(r.pregunta) || undefined,
        etiqueta_resultado: T(r.etiqueta_resultado) || undefined, permite_otro: SI(r.permite_otro), confirma_en: T(r.confirma_en) || undefined,
        formula: T(r.formula) || undefined, motor: T(r.motor) || undefined, aparece: T(r.aparece) || undefined,
        lista: LISTA(r.lista), sentido: T(r.sentido) || undefined, umbral: T(r.umbral) === '' ? undefined : r.umbral, explica: LISTA(r.explica),
        orden: ENTERO(r.orden), prioridad: ENTERO(r.prioridad), oculto: SI(r.oculto), pregunta_ppp40: LISTA(r.pregunta_ppp40),
        version: ENTERO(r.version), mercado_dato: T(r.mercado_dato) || undefined, compuesto: SI(r.compuesto), opciones: [], efectos: [], alertas: []
      };
      if (T(r.unidad_escala) !== '') n.unidad.escala = NUM(r.unidad_escala);
      if (T(r.referencia_valor) !== '' || T(r.referencia_opcion) || T(r.referencia_origen)) {
        n.referencia = { origen: T(r.referencia_origen) };
        if (T(r.referencia_valor) !== '') n.referencia.valor = r.referencia_valor;
        if (T(r.referencia_opcion)) n.referencia.opcion = T(r.referencia_opcion);
      }
      if (T(r.rango_min) !== '' || T(r.rango_max) !== '' || T(r.rango_paso) !== '') n.rango = { min: r.rango_min, max: r.rango_max, paso: r.rango_paso };
      if (T(r.vista_a_factor) || T(r.vista_de_factor)) n.vista = { a_factor: T(r.vista_a_factor), de_factor: T(r.vista_de_factor) };
      cr.nodos.push(n);
    });
    const porId = {}; cr.nodos.forEach((n) => { porId[n.id] = n; });
    (tab.ARBOL_OPCIONES || []).forEach((r, k) => {
      const n = porId[T(r.nodo)];
      if (!n) { errores.push({ pestana: 'ARBOL_OPCIONES', fila: k + 2, columna: 'nodo', codigo: 'id_inexistente', mensaje: 'La opción «' + T(r.clave) + '» cuelga del nodo «' + T(r.nodo) + '», que no existe en ARBOL_NODOS.' }); return; }
      if (T(r.solo_si)) errores.push({ pestana: 'ARBOL_OPCIONES', fila: k + 2, columna: 'solo_si', codigo: 'solo_si_retirada', mensaje: 'La columna solo_si ya no se usa desde la versión 1.2: ahora las opciones no se quitan, se avisa con una alerta.' });
      n.opciones.push({
        _fila: k + 2, clave: T(r.clave), nombre: T(r.nombre), implica: T(r.implica), valor: T(r.valor) === '' ? null : r.valor, escribe: T(r.escribe) || undefined,
        orden: ENTERO(r.orden), componentes: T(r.componentes) || undefined, fuente: T(r.fuente) || undefined, fecha_fuente: T(r.fecha_fuente) || undefined,
        por_omision: T(r.por_omision) || undefined
      });
    });
    const efs = {};
    (tab.ARBOL_REGLAS || []).forEach((r, k) => {
      const n = porId[T(r.nodo)], fila = k + 2;
      if (!n) { errores.push({ pestana: 'ARBOL_REGLAS', fila, columna: 'nodo', codigo: 'id_inexistente', mensaje: 'La regla «' + T(r.id) + '» pertenece al nodo «' + T(r.nodo) + '», que no existe.' }); return; }
      const clase = T(r.clase).toLowerCase();
      if (clase === 'alerta') {
        n.alertas.push({ _fila: fila, id: T(r.id), nivel: T(r.nivel), cuando: T(r.cuando), texto: T(r.texto), sobre: LISTA(r.sobre), orden: ENTERO(r.orden), palancas: T(r.palancas), medida: T(r.medida), meta: T(r.meta) === '' ? '' : r.meta, pasa_si: T(r.pasa_si), sugiere: T(r.sugiere), texto_sugerencia: T(r.texto_sugerencia), texto_cierre: T(r.texto_cierre) });
      } else if (clase === 'efecto') {
        const clave = n.id + '|' + T(r.id);
        let ef = efs[clave];
        if (!ef) { ef = efs[clave] = { _fila: fila, id: T(r.id), cuando: T(r.cuando), haz: [], orden: ENTERO(r.orden) }; n.efectos.push(ef); }
        const acc = T(r.accion);
        if (acc === 'valor_opcion') ef.haz.push({ valor_opcion: { clave: T(r.objetivo), valor: r.valor } });
        else if (acc === 'ref') ef.haz.push({ ref: r.valor });
        else if (acc === 'rango') { let g = ef.haz.find((h) => h.rango); if (!g) { g = { rango: {} }; ef.haz.push(g); } g.rango[T(r.objetivo)] = r.valor; }
        else if (acc === 'nota') ef.haz.push({ nota: T(r.texto) });
        else ef.haz.push({ [acc || '?']: r.valor });
      } else errores.push({ pestana: 'ARBOL_REGLAS', fila, columna: 'clase', codigo: 'clase_invalida', mensaje: 'La clase «' + T(r.clase) + '» no es válida: use «efecto» o «alerta».' });
    });
    (tab.ARBOL_COMPONENTES || []).forEach((r, k) => cr.componentes.push(Object.assign({ _fila: k + 2 }, r)));
    (tab.ARBOL_FACTORES || []).forEach((r, k) => cr.factores.push(Object.assign({ _fila: k + 2 }, r)));
    const fl = {};
    (tab.ARBOL_FLUJOS || []).forEach((r, k) => {
      let f = fl[T(r.flujo)];
      if (!f) { f = fl[T(r.flujo)] = { id: T(r.flujo), renglones: [] }; cr.flujos.push(f); }
      const par = parseParametros(r.parametros);
      f.renglones.push({ _fila: k + 2, concepto: T(r.concepto), signo: T(r.signo), monto: T(r.monto), perfil: T(r.perfil), desde: T(r.desde), hasta: T(r.hasta), parametros: par });
    });
    (tab.ARBOL_LISTAS || []).forEach((r, k) => cr.listas.push({ _fila: k + 2, lista: T(r.lista), valor: T(r.valor), nombre: T(r.nombre) }));
    (tab.ARBOL_VERSIONES || []).forEach((r) => cr.versiones.push(r));
    cr.tiposIds = (tab.ARBOL_TIPOS || []).map((r) => T(r.id));
    const t0 = (tab.ARBOL_TIPOS || [])[0];
    if (t0) cr.tipo = { id: T(t0.id), nombre: T(t0.nombre), max_abiertas: t0.max_abiertas, incluye: LISTA(t0.modulos), version: ENTERO(t0.version), max_sugerencias: t0.max_sugerencias, tope_corridas: t0.tope_corridas, tope_ms: t0.tope_ms };
    return cr;
  }

  /* Del JSON canónico (vertical.json) al mismo formato interno, con copias de lo que se va a tocar. */
  function desdeJson(j) {
    const cr = { tipo: clonar(j.tipo) || null, nodos: [], componentes: clonar(j.componentes) || [], factores: clonar(j.factores) || [], flujos: clonar(j.flujos) || [], listas: clonar(j.listas) || [], versiones: [], fuente: 'json' };
    (j.nodos || []).forEach((n0, k) => {
      const n = clonar(n0);
      n._fila = k + 2;
      n.tarjetas = LISTA(n.tarjetas); n.usa = LISTA(n.usa); n.lista = LISTA(n.lista); n.explica = LISTA(n.explica);
      n.opciones = (n.opciones || []).map((o, q) => Object.assign({ _fila: q + 2 }, o));
      n.efectos = n.efectos || []; n.alertas = (n.alertas || []).map((a, q) => Object.assign({ _fila: q + 2 }, a, { sobre: LISTA(a.sobre) }));
      cr.nodos.push(n);
    });
    cr.flujos.forEach((f) => { f.renglones = (f.renglones || []).map((r, q) => Object.assign({ _fila: q + 2 }, r, { parametros: r.parametros || {} })); });
    return cr;
  }

  /* `quita` y `parchea` del tipo (D7 7.1): se aplican a los nodos ya leídos. `incluye` es informativo: el archivo ya trae solo los nodos del tipo. */
  function aplicaTipo(cr, errores) {
    const t = cr.tipo; if (!t) return cr;
    LISTA(t.quita).forEach((id) => {
      const k = cr.nodos.findIndex((n) => n.id === id);
      if (k < 0) errores.push({ pestana: 'ARBOL_TIPOS', fila: 2, columna: 'quita', codigo: 'id_inexistente', mensaje: 'El tipo quita el nodo «' + id + '», que no existe.' });
      else cr.nodos.splice(k, 1);
    });
    const p = t.parchea && typeof t.parchea === 'object' ? t.parchea : {};
    Object.keys(p).forEach((id) => {
      const n = cr.nodos.find((q) => q.id === id);
      if (!n) { errores.push({ pestana: 'ARBOL_TIPOS', fila: 2, columna: 'parchea', codigo: 'id_inexistente', mensaje: 'El tipo parchea el nodo «' + id + '», que no existe.' }); return; }
      Object.keys(p[id]).forEach((campo) => {
        const v = p[id][campo];
        if (v && typeof v === 'object' && !Array.isArray(v) && n[campo] && typeof n[campo] === 'object' && !Array.isArray(n[campo])) n[campo] = Object.assign({}, n[campo], clonar(v)); else n[campo] = clonar(v);
      });
    });
    return cr;
  }

  /* T-10: una extensión (definicion/reparto.json o sus filas reparto_nodos.csv y reparto_factores.csv) agrega nodos y factores a la
     definición sin tocar vertical.json. El JSON se extiende con JSON y las pestañas con pestañas (filas con nombre o matrices de Sheets). */
  function extiendeDefinicion(entrada, ext, errores) {
    const err = (m) => { errores.push({ pestana: 'ARBOL_NODOS', fila: 0, columna: '', codigo: 'extension_invalida', mensaje: m }); return null; };
    try { if (typeof entrada === 'string') entrada = JSON.parse(entrada); if (typeof ext === 'string') ext = JSON.parse(ext); } catch (e) { return err('La extensión o la definición no es un JSON válido: ' + e.message); }
    if (!entrada || typeof entrada !== 'object' || !ext || typeof ext !== 'object') return err('Falta la definición o la extensión.');
    const tablas = (o) => Object.keys(o).some((k) => COLUMNAS[k] || COLUMNAS[k.toUpperCase()]);
    if (!tablas(entrada)) {
      if (!Array.isArray(ext.nodos)) return err('La extensión de un JSON debe traer «nodos» (y puede traer «factores»).');
      const out = Object.assign({}, entrada);
      out.nodos = (entrada.nodos || []).concat(clonar(ext.nodos));
      out.factores = (entrada.factores || []).concat(clonar(ext.factores || []));
      return out;
    }
    if (!tablas(ext)) return err('La extensión de las pestañas ARBOL_* debe venir en pestañas (ARBOL_NODOS y ARBOL_FACTORES).');
    const out = Object.assign({}, entrada);
    Object.keys(ext).forEach((t) => {
      const base = entrada[t], add = ext[t]; if (!Array.isArray(add) || !add.length) return;
      if (!Array.isArray(base)) { out[t] = clonar(add); return; }
      const matrizB = Array.isArray(base[0]), matrizA = Array.isArray(add[0]);
      const filasA = matrizA ? add.slice(1).map((f) => add[0].reduce((o, c, i) => { o[c] = f[i] === undefined ? '' : f[i]; return o; }, {})) : add;
      out[t] = matrizB ? base.concat(filasA.map((f) => base[0].map((c) => (f[c] === undefined ? '' : f[c])))) : base.concat(clonar(filasA));
    });
    return out;
  }
  function normalizaEntrada(entrada, errores) {
    if (typeof entrada === 'string') { try { entrada = JSON.parse(entrada); } catch (e) { errores.push({ pestana: 'ARBOL_NODOS', fila: 0, columna: '', codigo: 'json_invalido', mensaje: 'El texto no es un JSON válido: ' + e.message }); return null; } }
    if (!entrada || typeof entrada !== 'object') { errores.push({ pestana: 'ARBOL_NODOS', fila: 0, columna: '', codigo: 'sin_definicion', mensaje: 'No se recibió ninguna definición.' }); return null; }
    const esTablas = Object.keys(entrada).some((k) => COLUMNAS[k] || COLUMNAS[k.toUpperCase()]);
    if (esTablas) return aplicaTipo(desdeTablas(entrada, errores), errores);
    if (Array.isArray(entrada.nodos)) return aplicaTipo(desdeJson(entrada), errores);
    errores.push({ pestana: 'ARBOL_NODOS', fila: 0, columna: '', codigo: 'sin_definicion', mensaje: 'No reconozco el formato: se espera el JSON de la definición (con «nodos») o las pestañas ARBOL_* en filas.' });
    return null;
  }


  /* ═════════════════════════ CARGA: compilación y validación ═════════════════════════ */
  const PERFILES_F01 = ['puntual', 'parejo', 'cobranza_por_venta'];
  const PERFILES_F02 = ['config', 'cobranza_libro', 'curva_obra', 'indirectos_libro', 'proporcional_a_obra', 'porcentaje_de_cobranza', 'puntual', 'parejo', 'banco_capital'];
  const PARAMS_PERFIL = {
    cobranza_por_venta: ['enganche', 'durante_obra', 'saldo', 'rezago', 'inicio_ventas', 'meses_venta', 'fin_obra'],
    cobranza_libro: ['enganche', 'durante_obra', 'individualizar', 'meses_saldos', 'saldo_posterior', 'inicio_ventas', 'meses_venta', 'fin_obra', 'obra_total'],
    curva_obra: ['inicio', 'duracion', 'desviacion'],
    indirectos_libro: ['predesarrollo', 'parte_predesarrollo', 'obra_total'],
    proporcional_a_obra: ['obra_total'],
    banco_capital: ['usa_banco', 'capital', 'rendimiento', 'tasa_banco', 'apertura', 'linea', 'caja_minima', 'devolver_con_obra', 'inicio_obra', 'fin_obra', 'unidades']
  };
  const MEDIDAS_F01 = ['tir_anual', 'vpn', 'hoyo_maximo', 'mes_recuperacion', 'serie_acumulada'];
  const MEDIDAS_F02 = ['banco_maximo', 'capital_aportado', 'respaldo_faltante', 'respaldo_saldo_maximo', 'dinero_ajeno_maximo', 'mes_liquidacion_banco', 'primer_desembolso', 'preventa_al_inicio_obra', 'preventa_al_desembolso', 'cobertura_minima', 'costo_dinero', 'caja_cierre', 'pagos_durante_obra', 'rendimiento_capital', 'fuera_horizonte', 'cuadra', 'serie'];
  /* Copia de lectura de las 9 pruebas de «revisión para fondos» del libro (D7 8.2b y 16.6). */
  /* Ola 6 (decisión C): `umbral` y `justaHasta` son el valor DEL LIBRO (se conservan para marcar «umbral propio»); el umbral que usa el plan sale del dato `ru`
     (RU-01 a RU-09; RU-10 para la zona «justa» de la prueba 4). Si la definición no trae esos nodos (copias viejas), vale el del libro. */
  const PRUEBAS_LIBRO = [
    { n: 1, id: 'RV-01', ru: 'RU-01', pasa: '<=', umbral: 0.65, tipo: 'razon' }, { n: 2, id: 'RV-02', ru: 'RU-02', pasa: '<=', umbral: 0.5, tipo: 'razon' },
    { n: 3, id: 'RV-03', ru: 'RU-03', pasa: '<=', umbral: 36, tipo: 'meses' }, { n: 4, id: 'RV-04', ru: 'RU-04', pasa: '>=', umbral: 0.2, tipo: 'razon', justaHasta: 0.25, ruJusta: 'RU-10' },
    { n: 5, id: 'RV-05', ru: 'RU-05', pasa: '>=', umbral: 0.2, tipo: 'razon' }, { n: 6, id: 'RV-06', ru: 'RU-06', pasa: '<', umbral: 10000, tipo: 'pesos' },
    { n: 7, id: 'RV-07', ru: 'RU-07', pasa: '>=', umbral: 0.35, tipo: 'razon' }, { n: 8, id: 'RV-08', ru: 'RU-08', pasa: '>=', umbral: 0.4, tipo: 'razon' },
    { n: 9, id: 'RV-09', ru: 'RU-09', pasa: '>=', umbral: 1.3, tipo: 'veces' }
  ];
  /* «máximo 65%», «al menos 1.3 veces»…: el umbral en palabras (sin IDs) */
  function textoUmbral(p, x) {
    const f = p.tipo === 'razon' ? String(Math.round(x * 1000) / 10) + '%' : p.tipo === 'meses' ? miles(x, 0) + ' meses' : p.tipo === 'pesos' ? '$' + miles(x, 0) : String(Math.round(x * 100) / 100) + ' veces';
    return (p.pasa === '<=' ? 'máximo ' : p.pasa === '>=' ? 'al menos ' : p.pasa === '<' ? 'menos de ' : 'más de ') + f;
  }

  function compilaDefinicion(cr, errores, avisos) {
    const E_ = (pestana, fila, columna, mensaje, codigo) => errores.push({ pestana, fila, columna, mensaje, codigo: codigo || 'definicion' });
    const idsUsados = new Map();   // ID -> primera ubicación
    const marca = (an, loc) => { an.ids.forEach((id) => { if (!idsUsados.has(id)) idsUsados.set(id, loc); }); };
    const limites = (an, loc, txt) => {
      if (an.ids.size > MAX_SIMB) E_(loc.p, loc.f, loc.c, 'La expresión usa ' + an.ids.size + ' IDs distintos y el máximo es ' + MAX_SIMB + '.', 'expresion_larga');
      if (an.prof > MAX_PROF) E_(loc.p, loc.f, loc.c, 'La expresión está anidada ' + an.prof + ' niveles y el máximo es ' + MAX_PROF + ': pártala en dos nodos calculados.', 'expresion_profunda');
    };
    const loc = (p, f, c) => ({ p, f, c });
    /* expresión sola */
    const pe = (raw, l, opts) => {
      if (T(raw) === '') return null;
      try {
        const ast = parsea(T(raw), opts && opts.v); const an = analizaAst(ast); marca(an, l); limites(an, l, raw);
        return { ast, txt: T(raw), an };
      } catch (e) { if (!e.expr) throw e; E_(l.p, l.f, l.c, 'En «' + T(raw) + '»: ' + e.message, 'expresion_invalida'); return null; }
    };
    /* celda (admite variantes) */
    const pc = (raw, l, opts) => {
      try {
        const c = parseCelda(raw, opts); if (!c) return null;
        [c.base].concat(c.vars).forEach((x) => { const an = analizaAst(x.ast); marca(an, l); limites(an, l, x.texto); x.an = an; });
        c.loc = l; return c;
      } catch (e) { if (!e.expr) throw e; E_(l.p, l.f, l.c, 'En «' + T(raw) + '»: ' + e.message, e.message.indexOf('variante') >= 0 ? 'variante_invalida' : 'expresion_invalida'); return null; }
    };
    const SIN_VAR = { sinVariantes: true };

    /* ── tipo y listas ── */
    const t0 = cr.tipo || { id: 'vertical', nombre: 'Vertical', max_abiertas: 3, version: 1 };
    const tipoId = T(t0.id) || 'vertical';
    const L = { versiones_plan: [], escenarios: [] };
    (cr.listas || []).forEach((r) => { if (L[r.lista]) L[r.lista].push(T(r.valor)); });
    const sinListaV = !L.versiones_plan.length, sinListaE = !L.escenarios.length;
    if (sinListaV) L.versiones_plan = ['V1', 'V2', 'V3'];
    if (sinListaE) L.escenarios = ['base', 'conservador', 'optimista'];
    const lt = (c, l) => (c === undefined || c === null || T(c) === '' ? null : pc(c, l, {}));
    const tipo = {
      id: tipoId, nombre: T(t0.nombre), version: t0.version == null ? 1 : t0.version, incluye: LISTA(t0.incluye || t0.modulos),
      maxAbiertas: lt(t0.max_abiertas == null ? 3 : t0.max_abiertas, loc('ARBOL_TIPOS', 2, 'max_abiertas')),
      maxSug: lt(t0.max_sugerencias == null ? 5 : t0.max_sugerencias, loc('ARBOL_TIPOS', 2, 'max_sugerencias')),
      topeCorridas: lt(t0.tope_corridas == null ? 300 : t0.tope_corridas, loc('ARBOL_TIPOS', 2, 'tope_corridas')),
      topeMs: lt(t0.tope_ms == null ? 250 : t0.tope_ms, loc('ARBOL_TIPOS', 2, 'tope_ms')),
      flujoBanco: T(t0.flujo_banco) || null, flujoSimple: T(t0.flujo) || null
    };

    /* ── nodos: identidad, estructura y celdas ── */
    const raw = cr.nodos, porId = new Map();
    raw.forEach((n) => {
      const l = (c) => loc('ARBOL_NODOS', n._fila, c);
      if (!/^[A-Za-z]+[0-9]*-[0-9]+$/.test(n.id || '')) { E_('ARBOL_NODOS', n._fila, 'id', 'El ID «' + T(n.id) + '» no tiene la forma de un factor del Maestro (por ejemplo T-01 o P1-09).', 'id_invalido'); return; }
      if (porId.has(n.id)) { E_('ARBOL_NODOS', n._fila, 'id', 'El ID «' + n.id + '» está repetido (fila ' + porId.get(n.id)._fila + ').', 'id_repetido'); return; }
      porId.set(n.id, n);
    });
    const nodos = raw.filter((n) => porId.get(n.id) === n);

    /* registro de IDs: nodos, luego escritos por opciones (virtuales), luego datos */
    const ids = [], ix = new Map(), kind = [];
    const reg = (id, k) => { if (ix.has(id)) return ix.get(id); ix.set(id, ids.length); ids.push(id); kind.push(k); return ids.length - 1; };
    nodos.forEach((n) => reg(n.id, 'nodo'));

    const cn = [];      // nodos compilados (mismo orden)
    const escribeDe = new Map();   // ID escrito -> {writer, por opción}
    nodos.forEach((n, k) => {
      const l = (c) => loc('ARBOL_NODOS', n._fila, c);
      const c = {
        id: n.id, i: k, raw: n, tipo: n.tipo, modulo: n.modulo, titulo: T(n.titulo), tarjetas: n.tarjetas, de: n.de || null, raiz: !!n.raiz, usa: n.usa || [],
        unidad: { clase: T(n.unidad && n.unidad.clase), etiqueta: T(n.unidad && n.unidad.etiqueta) }, escala: null, que_es: T(n.que_es), pregunta: T(n.pregunta) || null,
        etiqueta_resultado: T(n.etiqueta_resultado) || null, permiteOtro: SI(n.permite_otro), confirma_en: T(n.confirma_en) || null, mercado_dato: T(n.mercado_dato) || null,
        orden: n.orden == null ? (k + 1) * 10 : n.orden, ordenDef: n.orden, prioridad: n.prioridad == null ? null : n.prioridad, oculto: SI(n.oculto), sentido: T(n.sentido) || null,
        explica: n.explica || [], lista: n.lista || [], version: n.version, compuesto: SI(n.compuesto), referencia: null, rango: null, opciones: [], efectos: [], alertas: [], comps: [],
        fuentes: false, formula: null, aparece: null, vista: null, umbral: null, motor: T(n.motor) || null
      };
      if (n.unidad && n.unidad.escala != null && T(n.unidad.escala) !== '') c.escala = NUM(n.unidad.escala);
      if (TIPOS_NODO.indexOf(c.tipo) < 0) E_('ARBOL_NODOS', n._fila, 'tipo', 'El tipo «' + c.tipo + '» no es válido (se_decide, se_busca, regla_oficio o calculado).', 'tipo_invalido');
      if (!c.titulo) E_('ARBOL_NODOS', n._fila, 'titulo', 'El nodo ' + n.id + ' no tiene título.', 'campo_obligatorio');
      if (!c.que_es) E_('ARBOL_NODOS', n._fila, 'que_es', 'El nodo ' + n.id + ' no tiene la explicación «que_es».', 'campo_obligatorio');
      if (!c.tarjetas.length) E_('ARBOL_NODOS', n._fila, 'tarjetas', 'El nodo ' + n.id + ' no dice a qué tarjeta del visor pertenece.', 'campo_obligatorio');
      c.tarjetas.forEach((t) => { if (TARJETAS.indexOf(t) < 0) E_('ARBOL_NODOS', n._fila, 'tarjetas', 'La tarjeta «' + t + '» no existe (' + TARJETAS.join(', ') + ').', 'tarjeta_invalida'); });
      if (CLASES_UNIDAD.indexOf(c.unidad.clase) < 0) E_('ARBOL_NODOS', n._fila, 'unidad_clase', 'La clase de unidad «' + c.unidad.clase + '» no es válida (' + CLASES_UNIDAD.join(', ') + ').', 'unidad_invalida');
      if (c.sentido && ['mas_es_mejor', 'menos_es_mejor', 'dato'].indexOf(c.sentido) < 0) E_('ARBOL_NODOS', n._fila, 'sentido', 'El sentido «' + c.sentido + '» no es válido.', 'sentido_invalido');
      if (n.formula) { c.formula = pe(n.formula, l('formula')); }
      if (n.aparece) { c.aparece = pe(n.aparece, l('aparece')); }
      if (n.vista && (n.vista.a_factor || n.vista.de_factor)) {
        c.vista = { a: pe(n.vista.a_factor, l('vista_a_factor'), { v: true }), d: pe(n.vista.de_factor, l('vista_de_factor')) };
        if (!n.vista.a_factor || !n.vista.de_factor) E_('ARBOL_NODOS', n._fila, 'vista_de_factor', 'La conversión de la vista necesita las dos columnas (vista_a_factor y vista_de_factor).', 'vista_incompleta');
      }
      if (n.referencia) {
        c.referencia = { origen: T(n.referencia.origen), opcion: T(n.referencia.opcion) || null, valor: null };
        if (n.referencia.valor !== undefined && T(n.referencia.valor) !== '') c.referencia.valor = pc(n.referencia.valor, l('referencia_valor'), {});
      }
      if (n.rango) {
        c.rango = { min: pc(n.rango.min, l('rango_min'), {}), max: pc(n.rango.max, l('rango_max'), {}), paso: pc(n.rango.paso, l('rango_paso'), {}) };
        if (!c.rango.min && !c.rango.max && !c.rango.paso) c.rango = null;
      }
      if (n.umbral != null && T(n.umbral) !== '') c.umbral = pc(n.umbral, l('umbral'), {});
      /* opciones */
      (n.opciones || []).forEach((o, q) => {
        const lo = (cl) => loc('ARBOL_OPCIONES', o._fila || q + 2, cl);
        const op = { clave: T(o.clave), nombre: T(o.nombre), implica: T(o.implica), valor: null, escribe: [], orden: o.orden == null ? q + 1 : o.orden, componentes: null, fuente: T(o.fuente) || null, fecha_fuente: T(o.fecha_fuente) || null, porOmision: SI(o.por_omision), raw: o };
        if (!/^[a-z0-9_]+$/.test(op.clave)) E_('ARBOL_OPCIONES', lo('clave').f, 'clave', 'La clave de opción «' + op.clave + '» solo puede llevar a-z, 0-9 y _ (nodo ' + n.id + ').', 'clave_invalida');
        if (c.opciones.some((x) => x.clave === op.clave)) E_('ARBOL_OPCIONES', lo('clave').f, 'clave', 'La clave «' + op.clave + '» está repetida en el nodo ' + n.id + '.', 'clave_repetida');
        if (!op.nombre) E_('ARBOL_OPCIONES', lo('clave').f, 'nombre', 'La opción «' + op.clave + '» del nodo ' + n.id + ' no tiene nombre.', 'campo_obligatorio');
        if (o.valor !== null && o.valor !== undefined && T(o.valor) !== '') op.valor = pc(o.valor, lo('valor'), {});
        if (T(o.escribe)) {
          T(o.escribe).split(';').forEach((par) => {
            const j = par.indexOf('='); if (j < 0) { E_('ARBOL_OPCIONES', lo('escribe').f, 'escribe', 'En «' + par + '» falta el «=» (se escribe ID=valor).', 'escribe_invalido'); return; }
            const tid = par.slice(0, j).trim(), ex = pe(par.slice(j + 1), lo('escribe'));
            if (!/^[A-Za-z]+[0-9]*-[0-9]+$/.test(tid)) { E_('ARBOL_OPCIONES', lo('escribe').f, 'escribe', 'El ID «' + tid + '» que escribe la opción no es válido.', 'escribe_invalido'); return; }
            if (ex) op.escribe.push({ tid, ex });
          });
        }
        if (T(o.componentes)) {
          op.componentes = LISTA(o.componentes).map((tok) => {
            const j = tok.indexOf('='); if (j < 0) return { clave: tok, cant: null };
            return { clave: tok.slice(0, j).trim(), cant: pc(tok.slice(j + 1), lo('componentes'), {}) };
          });
        }
        c.opciones.push(op);
      });
      /* efectos */
      (n.efectos || []).forEach((ef, q) => {
        const lr = (cl) => loc('ARBOL_REGLAS', ef._fila || q + 2, cl);
        const e2 = { id: T(ef.id), cuando: pe(ef.cuando, lr('cuando')), haz: [], orden: ef.orden == null ? 10 : ef.orden };
        if (!e2.cuando) E_('ARBOL_REGLAS', lr('cuando').f, 'cuando', 'El efecto «' + e2.id + '» no tiene condición.', 'campo_obligatorio');
        (ef.haz || []).forEach((h) => {
          const k = Object.keys(h)[0];
          if (k === 'quita_opcion' || k === 'agrega_opcion') E_('ARBOL_REGLAS', lr('accion').f, 'accion', 'La acción «' + k + '» ya no existe desde la versión 1.2: use una alerta con palancas.', 'accion_retirada');
          else if (k === 'valor_opcion') e2.haz.push({ k, clave: T(h[k].clave), ex: pe(h[k].valor, lr('valor')) });
          else if (k === 'ref') e2.haz.push({ k, ex: pc(h[k], lr('valor'), {}) });
          else if (k === 'rango') e2.haz.push({ k, min: pe(h[k].min, lr('valor')), max: pe(h[k].max, lr('valor')), paso: pe(h[k].paso, lr('valor')) });
          else if (k === 'nota') e2.haz.push({ k, texto: T(h[k]) });
          else E_('ARBOL_REGLAS', lr('accion').f, 'accion', 'La acción «' + k + '» no existe (valor_opcion, ref, rango o nota).', 'accion_invalida');
        });
        c.efectos.push(e2);
      });
      /* alertas */
      (n.alertas || []).forEach((a, q) => {
        const lr = (cl) => loc('ARBOL_REGLAS', a._fila || q + 2, cl);
        const al = {
          id: T(a.id), nivel: T(a.nivel), cuando: T(a.cuando) ? pe(a.cuando, lr('cuando')) : null, texto: T(a.texto), sobre: LISTA(a.sobre), orden: a.orden == null ? 10 : a.orden,
          palancasTxt: T(a.palancas), medida: T(a.medida) ? pe(a.medida, lr('medida')) : null, meta: T(a.meta) !== '' && a.meta != null ? pc(a.meta, lr('meta'), {}) : null,
          pasaSi: T(a.pasa_si), sugiere: T(a.sugiere) ? SI(a.sugiere) : null, textoSug: T(a.texto_sugerencia) || null, textoCierre: T(a.texto_cierre) || null, owner: k, fila: a._fila || q + 2
        };
        if (!al.id) E_('ARBOL_REGLAS', lr('id').f, 'id', 'Hay una alerta sin ID en el nodo ' + n.id + '.', 'campo_obligatorio');
        if (['info', 'aviso', 'alto'].indexOf(al.nivel) < 0) E_('ARBOL_REGLAS', lr('nivel').f, 'nivel', 'El nivel «' + al.nivel + '» de la alerta ' + al.id + ' no es válido (info, aviso o alto).', 'nivel_invalido');
        if (!al.texto) E_('ARBOL_REGLAS', lr('texto').f, 'texto', 'La alerta ' + al.id + ' no tiene texto.', 'campo_obligatorio');
        const conMed = !!(al.medida || al.meta || al.pasaSi);
        if (conMed) {
          if (!al.medida || !al.meta || ['>=', '>', '<=', '<'].indexOf(al.pasaSi) < 0) E_('ARBOL_REGLAS', lr('medida').f, 'medida', 'La alerta ' + al.id + ' necesita medida, meta y pasa_si (>=, >, <= o <) juntas.', 'medida_incompleta');
        }
        if (!al.cuando && !(al.medida && al.meta && al.pasaSi)) E_('ARBOL_REGLAS', lr('cuando').f, 'cuando', 'La alerta ' + al.id + ' no tiene condición ni medida con meta: no sabe cuándo activarse.', 'alerta_sin_condicion');
        c.alertas.push(al);
      });
      cn.push(c);
    });

    /* estructura de la raíz y de los padres */
    const raices = cn.filter((c) => c.raiz);
    if (raices.length !== 1) E_('ARBOL_NODOS', raices.length ? raices[1]._fila || 0 : 0, 'raiz', raices.length ? 'Hay ' + raices.length + ' nodos raíz y debe haber uno solo.' : 'No hay nodo raíz (el predio): marque raiz = si en uno.', 'raiz');
    cn.forEach((c) => {
      const n = c.raw;
      if (!c.raiz) {
        if (!c.de) E_('ARBOL_NODOS', n._fila, 'de', 'El nodo ' + c.id + ' no dice de quién cuelga (columna «de»).', 'sin_padre');
        else if (!ix.has(c.de) || kind[ix.get(c.de)] !== 'nodo') E_('ARBOL_NODOS', n._fila, 'de', 'El nodo ' + c.id + ' cuelga de «' + c.de + '», que no existe como nodo.', 'id_inexistente');
        else if (c.de === c.id) E_('ARBOL_NODOS', n._fila, 'de', 'El nodo ' + c.id + ' cuelga de sí mismo.', 'ciclo');
      }
      c.usa.forEach((u) => { if (!ix.has(u)) E_('ARBOL_NODOS', n._fila, 'usa', 'El nodo ' + c.id + ' dice que usa «' + u + '», que no existe.', 'id_inexistente'); });
    });

    /* componentes del catálogo */
    const cm = cr.componentes || [];
    cm.forEach((r, q) => {
      const fila = r._fila || q + 2, l = (cl) => loc('ARBOL_COMPONENTES', fila, cl);
      const dueno = cn.find((c) => c.id === T(r.nodo));
      if (!dueno) { E_('ARBOL_COMPONENTES', fila, 'nodo', 'El componente «' + T(r.clave) + '» cuelga del nodo «' + T(r.nodo) + '», que no existe.', 'id_inexistente'); return; }
      if (!dueno.compuesto) E_('ARBOL_COMPONENTES', fila, 'nodo', 'El nodo ' + dueno.id + ' tiene componentes pero no está marcado como compuesto.', 'compuesto_invalido');
      const cmp = {
        clave: T(r.clave), nombre: T(r.nombre), rol: T(r.rol), unidad: T(r.unidad_base), cantidad: pc(r.cantidad, l('cantidad'), {}), m2u: NUM(r.m2_por_unidad), base: T(r.base) || null,
        min: pc(r.min, l('min'), {}), max: pc(r.max, l('max'), {}), paso: pc(r.paso, l('paso'), {}), activoRef: pc(r.activo_ref, l('activo_ref'), { bareSiNo: true }),
        fuente: T(r.fuente), nota: T(r.nota), orden: r.orden == null || T(r.orden) === '' ? q + 1 : Number(r.orden), fila
      };
      if (!/^[a-z0-9_]+$/.test(cmp.clave)) E_('ARBOL_COMPONENTES', fila, 'clave', 'La clave del componente «' + cmp.clave + '» solo puede llevar a-z, 0-9 y _.', 'clave_invalida');
      if (dueno.comps.some((x) => x.clave === cmp.clave)) E_('ARBOL_COMPONENTES', fila, 'clave', 'La clave «' + cmp.clave + '» está repetida en el nodo ' + dueno.id + '.', 'clave_repetida');
      if (['m2', 'pct', 'n'].indexOf(cmp.unidad) < 0) E_('ARBOL_COMPONENTES', fila, 'unidad_base', 'La unidad «' + cmp.unidad + '» del componente ' + cmp.clave + ' no es válida (m2, pct o n).', 'unidad_invalida');
      if (cmp.unidad === 'n' && !(cmp.m2u > 0)) E_('ARBOL_COMPONENTES', fila, 'm2_por_unidad', 'El componente ' + cmp.clave + ' se mide en piezas: falta m2_por_unidad.', 'campo_obligatorio');
      if (cmp.unidad === 'pct' && (!cmp.base || !ix.has(cmp.base))) E_('ARBOL_COMPONENTES', fila, 'base', 'El componente ' + cmp.clave + ' se mide en % de «' + cmp.base + '», que no existe.', 'id_inexistente');
      if (!cmp.rol) E_('ARBOL_COMPONENTES', fila, 'rol', 'El componente ' + cmp.clave + ' no tiene rol.', 'campo_obligatorio');
      if (!T(r.fuente)) avisos.push({ pestana: 'ARBOL_COMPONENTES', fila, columna: 'fuente', mensaje: 'El componente ' + cmp.clave + ' no dice de dónde sale su cantidad (obligatorio para publicar).' });
      dueno.comps.push(cmp);
    });
    cn.forEach((c) => c.comps.sort((a, b) => a.orden - b.orden));

    /* escribe -> IDs virtuales (los escribe una sola decisión) */
    cn.forEach((c) => {
      c.opciones.forEach((op) => op.escribe.forEach((w) => {
        if (ix.has(w.tid) && kind[ix.get(w.tid)] === 'nodo') { E_('ARBOL_OPCIONES', op.raw._fila || 0, 'escribe', 'La opción «' + op.clave + '» de ' + c.id + ' escribe sobre «' + w.tid + '», que ya es un nodo con valor propio: elija un factor sin nodo.', 'escribe_invalido'); return; }
        let e = escribeDe.get(w.tid);
        if (e && e.writer !== c.id) { E_('ARBOL_OPCIONES', op.raw._fila || 0, 'escribe', 'El factor «' + w.tid + '» lo escriben dos decisiones (' + e.writer + ' y ' + c.id + ').', 'escribe_choque'); return; }
        if (!e) { e = { writer: c.id, por: {} }; escribeDe.set(w.tid, e); reg(w.tid, 'virtual'); }
        (e.por[op.clave] = e.por[op.clave] || []).push(w);
      }));
    });

    /* flujos (se leen aquí porque sus IDs cuentan como dependencias) */
    const flujos = {};
    (cr.flujos || []).forEach((f) => {
      const fl = { id: T(f.id), renglones: [], ids: new Set(), mesesMax: NUM(f.meses_max), baseMes: NUM(f.base_mes), perfilesTodos: [] };
      (f.renglones || []).forEach((r, q) => {
        const fila = r._fila || q + 2, l = (cl) => loc('ARBOL_FLUJOS', fila, cl);
        const rg = { concepto: T(r.concepto), signo: T(r.signo), perfil: T(r.perfil), monto: pe(r.monto, l('monto')), desde: pe(r.desde, l('desde')), hasta: pe(r.hasta, l('hasta')), par: {}, parTxt: {}, fila };
        const par = r.parametros || {};
        Object.keys(par).forEach((k) => {
          const v = T(par[k]);
          if (k === 'tipologias') { rg.parTxt[k] = v; return; }
          if (k === 'meses_max' || k === 'base_mes') { rg.parTxt[k] = v; return; }
          rg.par[k] = pe(v, l('parametros'));
        });
        if (rg.perfil === 'config') { if (rg.parTxt.meses_max) fl.mesesMax = NUM(rg.parTxt.meses_max); if (rg.parTxt.base_mes) fl.baseMes = NUM(rg.parTxt.base_mes); }
        [rg.monto, rg.desde, rg.hasta].concat(Object.keys(rg.par).map((k) => rg.par[k])).forEach((x) => { if (x) x.an.ids.forEach((id) => fl.ids.add(id)); });
        fl.renglones.push(rg);
      });
      flujos[fl.id] = fl;
    });
    const esF02 = (fl) => fl.renglones.some((r) => ['cobranza_libro', 'curva_obra', 'banco_capital', 'indirectos_libro'].indexOf(r.perfil) >= 0);
    Object.keys(flujos).forEach((fid) => {
      const fl = flujos[fid]; fl.libro = esF02(fl);
      if (fl.mesesMax == null) fl.mesesMax = fl.libro ? 60 : 120;
      if (fl.baseMes == null) fl.baseMes = fl.libro ? 1 : 0;
      const ok = fl.libro ? PERFILES_F02 : PERFILES_F01;
      fl.renglones.forEach((rg) => {
        if (ok.indexOf(rg.perfil) < 0) E_('ARBOL_FLUJOS', rg.fila, 'perfil', 'El perfil «' + rg.perfil + '» no existe en la biblioteca del flujo ' + fid + ' (' + ok.join(', ') + ').', 'perfil_invalido');
        (PARAMS_PERFIL[rg.perfil] || []).forEach((p) => { if (!rg.par[p]) E_('ARBOL_FLUJOS', rg.fila, 'parametros', 'Al perfil «' + rg.perfil + '» le falta el parámetro «' + p + '» (flujo ' + fid + ').', 'parametro_faltante'); });
        if (['puntual', 'parejo'].indexOf(rg.perfil) >= 0) {
          if (!rg.monto) E_('ARBOL_FLUJOS', rg.fila, 'monto', 'El renglón «' + rg.concepto + '» del flujo ' + fid + ' no tiene monto.', 'campo_obligatorio');
          if (!rg.desde) E_('ARBOL_FLUJOS', rg.fila, 'desde', 'El renglón «' + rg.concepto + '» del flujo ' + fid + ' no dice desde qué mes.', 'campo_obligatorio');
          if (rg.perfil === 'parejo' && !rg.hasta) E_('ARBOL_FLUJOS', rg.fila, 'hasta', 'El renglón parejo «' + rg.concepto + '» necesita «hasta».', 'campo_obligatorio');
        }
      });
    });
    /* IDs que ningún nodo declara: datos del plan (si hay Maestro) o error */
    const maestro = (cr.factores || []).length ? new Set(cr.factores.map((f) => T(f.id))) : null;
    (cr.factores || []).forEach((f) => { if (!ix.has(T(f.id))) reg(T(f.id), 'dato'); });
    const desconocidos = [];
    idsUsados.forEach((l, id) => {
      if (ix.has(id)) return;
      if (flujos[id]) return;
      if (maestro) E_(l.p, l.f, l.c, 'El ID «' + id + '» no existe en el Maestro (ARBOL_FACTORES ni como nodo).', 'id_inexistente');
      else { reg(id, 'dato'); desconocidos.push(id); }
    });
    if (desconocidos.length) avisos.push({ pestana: 'ARBOL_FACTORES', fila: 0, columna: 'id', mensaje: 'No se cargó ARBOL_FACTORES: se aceptaron como datos del plan los IDs ' + desconocidos.join(', ') + '.' });
    const N = ids.length;

    /* tipologías disponibles (P1…P6 con unidades) y pruebas de revisión */
    const tipologias = [];
    for (let i = 1; i <= 6; i++) if (ix.has('P' + i + '-09') && kind[ix.get('P' + i + '-09')] === 'nodo') tipologias.push(i);
    const rvIds = PRUEBAS_LIBRO.map((p) => p.id).concat(PRUEBAS_LIBRO.map((p) => p.ru), ['RU-10']).filter((id) => ix.has(id));   // las pruebas y sus umbrales (los umbrales son datos: ola 6)
    const C = { ix, faltan: new Set(), tipologias: () => tipologias };
    const dctx = (propio) => ({ tipologias: () => tipologias, rv: () => rvIds, flujo: (fid) => (flujos[fid] ? Array.from(flujos[fid].ids) : []), comp: (nid) => { const d = cn.find((c) => c.id === nid); return d ? d.comps.filter((m) => m.base).map((m) => m.base) : []; } });

    /* ── compilar y reunir dependencias ── */
    const deps = []; for (let i = 0; i < N; i++) deps.push([]);
    const autoOk = new Set();
    const dep = (para, id, tipoArista) => { const j = ix.get(id); if (j === undefined || kind[j] === 'dato') return; if (j === para) { if (tipoArista !== 'vista' && kind[para] === 'nodo' && ['formula', 'condicion', 'efecto', 'escribe'].indexOf(tipoArista) >= 0 && !autoOk.has(para + '|' + tipoArista)) E_('ARBOL_NODOS', cn[para] ? cn[para].raw._fila : 0, tipoArista === 'condicion' ? 'aparece' : 'formula', 'El nodo ' + id + ' se usa a sí mismo (' + tipoArista + '): hay un ciclo de dependencias de un solo nodo.', 'ciclo'); return; } const ta = tipoArista === 'vista' ? 'formula' : tipoArista; if (!deps[para].some((d) => d.j === j && d.tipo === ta)) deps[para].push({ j, tipo: ta }); };
    const compE = (x) => { if (!x) return null; try { return compila(x.ast, C); } catch (e) { E_('ARBOL_NODOS', 0, '', 'No se pudo compilar «' + x.txt + '»: ' + e.message, 'expresion_invalida'); return () => null; } };
    const compCel = (cel) => { if (!cel) return null; try { compilaCelda(cel, C); } catch (e) { E_(cel.loc.p, cel.loc.f, cel.loc.c, 'No se pudo compilar «' + cel.texto + '»: ' + e.message, 'expresion_invalida'); cel.f0 = () => null; cel.vars.forEach((v) => { v.f = () => null; }); } return cel; };
    const depsExpr = (x, i, tipoArista, propio) => { if (x) depsDeAst(x.ast, dctx(propio), propio).forEach((id) => dep(i, id, tipoArista)); };
    const depsCel = (cel, i, tipoArista) => { if (cel) [cel.base].concat(cel.vars).forEach((x) => depsDeAst(x.ast, dctx(null), null).forEach((id) => dep(i, id, tipoArista))); };

    /* flujos: compilar */
    Object.keys(flujos).forEach((fid) => {
      const fl = flujos[fid];
      fl.renglones.forEach((rg) => { rg.fMonto = compE(rg.monto); rg.fDesde = compE(rg.desde); rg.fHasta = compE(rg.hasta); rg.fPar = {}; Object.keys(rg.par).forEach((k) => { rg.fPar[k] = compE(rg.par[k]); }); });
    });
    cn.forEach((c) => {
      const i = c.i;
      c.fFormula = compE(c.formula); c.fAparece = compE(c.aparece);
      if (c.vista) { c.vista.fa = compE(c.vista.a); c.vista.fd = compE(c.vista.d); }
      if (c.referencia && c.referencia.valor) compCel(c.referencia.valor);
      if (c.rango) { compCel(c.rango.min); compCel(c.rango.max); compCel(c.rango.paso); }
      compCel(c.umbral);
      c.opciones.forEach((op) => { compCel(op.valor); op.escribe.forEach((w) => { w.f = compE(w.ex); }); (op.componentes || []).forEach((q) => compCel(q.cant)); });
      c.efectos.forEach((ef) => { ef.fCuando = compE(ef.cuando); ef.haz.forEach((h) => { if (h.ex) { if (h.ex.base) compCel(h.ex); else h.f = compE(h.ex); } if (h.min) h.fmin = compE(h.min); if (h.max) h.fmax = compE(h.max); if (h.paso) h.fpaso = compE(h.paso); }); });
      c.alertas.forEach((al) => {
        al.fCuando = compE(al.cuando); al.fMedida = compE(al.medida); compCel(al.meta);
        const partes = []; const re = /\{([A-Za-z]+[0-9]*-[0-9]+)(?:\.([a-z]+))?\}/g; let u = 0, m;
        while ((m = re.exec(al.texto))) {
          partes.push({ lit: al.texto.slice(u, m.index) }); u = m.index + m[0].length;
          if (!ix.has(m[1])) E_('ARBOL_REGLAS', al.fila, 'texto', 'El texto de la alerta ' + al.id + ' cita {' + m[1] + '}, que no existe.', 'id_inexistente');
          partes.push({ id: m[1], campo: m[2] || 'valor' });
        }
        partes.push({ lit: al.texto.slice(u) }); al.partes = partes;
      });
      c.comps.forEach((m) => { compCel(m.cantidad); compCel(m.min); compCel(m.max); compCel(m.paso); compCel(m.activoRef); });
    });
    [tipo.maxAbiertas, tipo.maxSug, tipo.topeCorridas, tipo.topeMs].forEach(compCel);
    /* aristas */
    cn.forEach((c) => {
      const i = c.i;
      if (c.de) dep(i, c.de, 'de');
      c.usa.forEach((u) => dep(i, u, 'usa'));
      depsExpr(c.formula, i, 'formula', c.id);
      depsExpr(c.aparece, i, 'condicion');
      if (c.vista) { depsExpr(c.vista.a, i, 'vista'); depsExpr(c.vista.d, i, 'vista', c.id); }
      if (c.referencia && c.referencia.valor) depsCel(c.referencia.valor, i, 'formula');
      if (c.rango) { depsCel(c.rango.min, i, 'formula'); depsCel(c.rango.max, i, 'formula'); depsCel(c.rango.paso, i, 'formula'); }
      c.opciones.forEach((op) => { depsCel(op.valor, i, 'formula'); (op.componentes || []).forEach((q) => depsCel(q.cant, i, 'componente')); });
      c.efectos.forEach((ef) => { ef.soloNota = ef.haz.length > 0 && ef.haz.every((h) => h.k === 'nota'); if (ef.soloNota) return; depsExpr(ef.cuando, i, 'efecto'); ef.haz.forEach((h) => { if (h.ex) { if (h.ex.base) depsCel(h.ex, i, 'efecto'); else depsExpr(h.ex, i, 'efecto'); } depsExpr(h.min, i, 'efecto'); depsExpr(h.max, i, 'efecto'); depsExpr(h.paso, i, 'efecto'); }); });
      c.comps.forEach((m) => { if (m.base) dep(i, m.base, 'componente'); depsCel(m.cantidad, i, 'componente'); depsCel(m.min, i, 'componente'); depsCel(m.max, i, 'componente'); depsCel(m.activoRef, i, 'componente'); });
      /* una opción con valor/fuentes depende de lo que usen sus celdas */
    });
    escribeDe.forEach((e, tid) => {
      const v = ix.get(tid);
      dep(v, e.writer, 'escribe');
      Object.keys(e.por).forEach((k) => e.por[k].forEach((w) => depsExpr(w.ex, v, 'escribe')));
    });

    /* ── nodos: reglas por tipo (con las celdas ya compiladas) ── */
    const tarjetasEncendidas = new Set();
    cn.forEach((c) => {
      const n = c.raw, l = (cl) => loc('ARBOL_NODOS', n._fila, cl);
      const numerica = ['texto', 'si_no'].indexOf(c.unidad.clase) < 0;
      const tieneFuentes = (c.tipo === 'se_busca' || c.tipo === 'regla_oficio') && c.opciones.length > 0;
      c.fuentes = tieneFuentes;
      if (c.tipo === 'se_decide') {
        if (!c.pregunta) E_('ARBOL_NODOS', n._fila, 'pregunta', 'La decisión ' + c.id + ' no tiene pregunta.', 'campo_obligatorio');
        if (c.opciones.length < 2) E_('ARBOL_OPCIONES', 0, 'nodo', 'La decisión ' + c.id + ' tiene ' + c.opciones.length + ' opción(es) y necesita al menos 2.', 'pocas_opciones');
        if (!c.referencia || (!c.referencia.opcion && !c.referencia.valor)) E_('ARBOL_NODOS', n._fila, 'referencia_opcion', 'La decisión ' + c.id + ' no tiene referencia (lo que se usa con «No sé todavía»).', 'sin_referencia');
        else if (c.referencia.opcion && !c.opciones.some((o) => o.clave === c.referencia.opcion)) E_('ARBOL_NODOS', n._fila, 'referencia_opcion', 'La referencia de ' + c.id + ' apunta a la opción «' + c.referencia.opcion + '», que no existe.', 'referencia_invalida');
        if (c.permiteOtro && !c.rango) E_('ARBOL_NODOS', n._fila, 'rango_min', 'La decisión ' + c.id + ' permite otro valor pero no tiene rango.', 'rango_faltante');
        c.opciones.forEach((op) => { if (!op.valor && !c.compuesto) E_('ARBOL_OPCIONES', op.raw._fila || 0, 'valor', 'La opción «' + op.clave + '» de ' + c.id + ' no tiene valor.', 'opcion_sin_valor'); });
      } else if (c.tipo === 'se_busca' || c.tipo === 'regla_oficio') {
        if (!c.raiz && !tieneFuentes && !(c.referencia && c.referencia.valor)) E_('ARBOL_NODOS', n._fila, 'referencia_valor', 'El nodo ' + c.id + ' no tiene referencia ni fuentes.', 'sin_referencia');
        if (numerica && !c.raiz && !c.rango) E_('ARBOL_NODOS', n._fila, 'rango_min', 'El nodo ' + c.id + ' no tiene rango (mínimo, máximo y paso).', 'rango_faltante');
        if (c.tipo === 'se_busca' && !c.confirma_en && !c.raiz) E_('ARBOL_NODOS', n._fila, 'confirma_en', 'El dato que se busca ' + c.id + ' no dice dónde se confirma.', 'campo_obligatorio');
        if (c.tipo === 'se_busca' && !c.mercado_dato) E_('ARBOL_NODOS', n._fila, 'mercado_dato', 'El dato que se busca ' + c.id + ' no tiene campo de mercado (use «ninguno» si no aplica).', 'campo_obligatorio');
        if (tieneFuentes) {
          if (c.opciones.length < 2) E_('ARBOL_OPCIONES', 0, 'nodo', 'El nodo ' + c.id + ' tiene una sola fuente: déjela como referencia del nodo.', 'pocas_opciones');
          const po = c.opciones.filter((o) => o.porOmision);
          if (po.length !== 1) E_('ARBOL_OPCIONES', c.opciones[0].raw._fila || 0, 'por_omision', 'El nodo ' + c.id + ' debe tener exactamente una fuente por omisión y tiene ' + po.length + '.', 'por_omision');
          c.opciones.forEach((op) => {
            if (!op.fuente) E_('ARBOL_OPCIONES', op.raw._fila || 0, 'fuente', 'La fuente «' + op.clave + '» de ' + c.id + ' no dice de dónde sale.', 'fuente_faltante');
            if (!op.valor) E_('ARBOL_OPCIONES', op.raw._fila || 0, 'valor', 'La fuente «' + op.clave + '» de ' + c.id + ' no tiene valor.', 'opcion_sin_valor');
            if (op.escribe.length || op.componentes) E_('ARBOL_OPCIONES', op.raw._fila || 0, 'escribe', 'Una fuente no puede escribir otros factores ni llevar componentes (' + c.id + ').', 'fuente_invalida');
          });
          if (!c.referencia || !c.referencia.opcion) { if (po.length === 1) { c.referencia = c.referencia || { origen: '', valor: null }; c.referencia.opcion = po[0].clave; } }
          else if (po.length === 1 && c.referencia.opcion !== po[0].clave) E_('ARBOL_NODOS', n._fila, 'referencia_opcion', 'La referencia de ' + c.id + ' apunta a «' + c.referencia.opcion + '» pero la fuente por omisión es «' + po[0].clave + '».', 'referencia_invalida');
        }
      } else if (c.tipo === 'calculado') {
        if (!c.formula && !c.motor) E_('ARBOL_NODOS', n._fila, 'formula', 'El calculado ' + c.id + ' no tiene fórmula.', 'campo_obligatorio');
        if (c.motor && (c.motor.indexOf('reparto.') !== 0 || MEDIDAS_REPARTO.indexOf(c.motor.slice(8)) < 0)) E_('ARBOL_NODOS', n._fila, 'motor', 'El calculado ' + c.id + ' pide al motor «' + c.motor + '», que no existe (reparto.' + MEDIDAS_REPARTO.join(', reparto.') + ').', 'motor_invalido');
      }
      if (c.tipo !== 'se_decide' && c.opciones.length && !tieneFuentes && c.tipo === 'calculado') E_('ARBOL_OPCIONES', 0, 'nodo', 'Un calculado (' + c.id + ') no lleva opciones.', 'opciones_invalidas');
      if (c.compuesto) {
        if (c.tipo !== 'se_decide') E_('ARBOL_NODOS', n._fila, 'compuesto', 'Solo una decisión puede ser compuesta (' + c.id + ').', 'compuesto_invalido');
        if (c.comps.length < 2) E_('ARBOL_COMPONENTES', 0, 'nodo', 'El nodo compuesto ' + c.id + ' necesita al menos 2 componentes y tiene ' + c.comps.length + '.', 'compuesto_invalido');
        if (!c.formula || !c.formula.an.funcs.has('suma_componentes')) E_('ARBOL_NODOS', n._fila, 'formula', 'El nodo compuesto ' + c.id + ' necesita una fórmula que use suma_componentes.', 'compuesto_invalido');
        c.opciones.forEach((op) => {
          if (!op.componentes) E_('ARBOL_OPCIONES', op.raw._fila || 0, 'componentes', 'El preajuste «' + op.clave + '» de ' + c.id + ' no dice qué componentes prende.', 'compuesto_invalido');
          (op.componentes || []).forEach((q) => { if (!c.comps.some((m) => m.clave === q.clave)) E_('ARBOL_OPCIONES', op.raw._fila || 0, 'componentes', 'El preajuste «' + op.clave + '» nombra el componente «' + q.clave + '», que no existe en ' + c.id + '.', 'componente_desconocido'); });
        });
      }
      /* palancas de las alertas */
      c.alertas.forEach((al) => {
        const pal = al.palancasTxt; al.palancas = null;
        if (pal && pal !== 'automatico') {
          al.palancas = LISTA(pal);
          al.palancas.forEach((tk) => {
            const [id, cl] = tk.split('.');
            const d = cn.find((x) => x.id === id);
            if (!d) E_('ARBOL_REGLAS', al.fila, 'palancas', 'La palanca «' + tk + '» de la alerta ' + al.id + ' no existe.', 'id_inexistente');
            else if (cl && !d.comps.some((m) => m.clave === cl)) E_('ARBOL_REGLAS', al.fila, 'palancas', 'La palanca «' + tk + '» de la alerta ' + al.id + ': el componente «' + cl + '» no existe en ' + id + '.', 'componente_desconocido');
            else if (d.tipo === 'calculado') E_('ARBOL_REGLAS', al.fila, 'palancas', 'La palanca «' + tk + '» es un calculado: no se puede mover.', 'palanca_invalida');
          });
        }
        al.sugiereF = al.sugiere === null ? al.nivel !== 'info' : al.sugiere;
      });
    });
    const alertasIds = new Set();
    cn.forEach((c) => c.alertas.forEach((al) => { if (al.id && alertasIds.has(al.id)) E_('ARBOL_REGLAS', al.fila, 'id', 'La alerta «' + al.id + '» está repetida.', 'id_repetido'); alertasIds.add(al.id); }));
    if (C.faltan.size && maestro) { /* ya reportado por idsUsados */ }

    /* flujos citados que no existen */
    cn.forEach((c) => {
      const buscaFlujos = (x) => { if (x) x.an.flujos.forEach((f) => { if (!flujos[f]) E_('ARBOL_NODOS', c.raw._fila, 'formula', 'La fórmula de ' + c.id + ' usa el flujo «' + f + '», que no existe en ARBOL_FLUJOS.', 'flujo_desconocido'); }); };
      buscaFlujos(c.formula);
      c.alertas.forEach((al) => { buscaFlujos(al.cuando); buscaFlujos(al.medida); });
    });
    cn.forEach((c) => {
      if (!c.formula) return;
      const re = /flujo\s*\(\s*[A-Za-z]+-\d+\s*,\s*'([a-z_0-9]+)'/g; let m;
      while ((m = re.exec(c.formula.txt))) {
        const fid = (/flujo\s*\(\s*([A-Za-z]+-\d+)/.exec(m[0]) || [])[1], fl = flujos[fid];
        if (fl && (fl.libro ? MEDIDAS_F02 : MEDIDAS_F01).indexOf(m[1]) < 0) E_('ARBOL_NODOS', c.raw._fila, 'formula', 'La medida «' + m[1] + '» no existe en la biblioteca del flujo ' + fid + '.', 'medida_desconocida');
      }
    });

    /* ── orden topológico y ciclos (todas las aristas: de, usa, fórmulas, condiciones, efectos, escribe, flujos, componentes) ── */
    const orden = [], indeg = new Array(N).fill(0), sal = []; for (let i = 0; i < N; i++) sal.push([]);
    for (let i = 0; i < N; i++) deps[i].forEach((d) => { sal[d.j].push(i); indeg[i]++; });
    const lista = []; for (let i = 0; i < N; i++) if (indeg[i] === 0) lista.push(i);
    let cabeza = 0;
    while (cabeza < lista.length) {
      lista.sort((a, b) => a - b);
      const i = lista.splice(0, 1)[0]; orden.push(i);
      sal[i].forEach((k) => { if (--indeg[k] === 0) lista.push(k); });
    }
    if (orden.length < N) {
      const resto = []; for (let i = 0; i < N; i++) if (indeg[i] > 0) resto.push(i);
      /* encontrar un ciclo concreto dentro del resto */
      const enResto = new Set(resto), color = {}; let ciclo = null;
      const dfs = (u, pila) => {
        color[u] = 1; pila.push(u);
        for (const d of deps[u]) {
          if (!enResto.has(d.j)) continue;
          if (color[d.j] === 1) { ciclo = pila.slice(pila.indexOf(d.j)).concat(d.j); return true; }
          if (!color[d.j] && dfs(d.j, pila)) return true;
        }
        pila.pop(); color[u] = 2; return false;
      };
      for (const u of resto) { if (!color[u] && dfs(u, [])) break; }
      const camino = ciclo ? ciclo.map((i) => ids[i]).reverse().join(' → ') : resto.map((i) => ids[i]).join(', ');
      const fila = ciclo && kind[ciclo[0]] === 'nodo' ? cn[ciclo[0]].raw._fila : 0;
      E_('ARBOL_NODOS', fila, 'formula', 'Hay un ciclo de dependencias: ' + camino + ' (cada nodo usa al siguiente). Rompa el ciclo quitando una de esas dependencias.', 'ciclo');
    }

    /* ── contextos y revisión de constantes: rangos invertidos, referencia y opciones fuera de rango ── */
    const ctxs = [{ version: null, escenario: 'base', tipo: tipoId }];
    cn.forEach((c) => {
      const cel = []; if (c.referencia && c.referencia.valor) cel.push(c.referencia.valor); if (c.rango) cel.push(c.rango.min, c.rango.max, c.rango.paso); c.opciones.forEach((o) => cel.push(o.valor)); c.comps.forEach((m) => cel.push(m.cantidad, m.min, m.max, m.paso, m.activoRef));
      cel.forEach((x) => { if (x) x.vars.forEach((v) => v.sel.forEach((g) => g.forEach((e) => { const cx = { version: null, escenario: 'base', tipo: tipoId }; if (L.versiones_plan.indexOf(e) >= 0) cx.version = e; else if (L.escenarios.indexOf(e) >= 0) cx.escenario = e; else if (e !== tipoId) cx.tipo = e; if (!ctxs.some((q) => canonico(q) === canonico(cx))) ctxs.push(cx); }))); });
    });
    /* validación de selectores (13.4) */
    const tiposIds = new Set([tipoId].concat(cr.tiposIds || []));
    const claseDe = (e) => (L.versiones_plan.indexOf(e) >= 0 ? 'v' : L.escenarios.indexOf(e) >= 0 ? 'e' : tiposIds.has(e) ? 't' : null);
    const checaSel = (cel) => {
      if (!cel) return;
      const vistos = new Set();
      cel.vars.forEach((v) => {
        const clave = v.selTxt.replace(/\s+/g, '');
        if (vistos.has(clave)) E_(cel.loc.p, cel.loc.f, cel.loc.c, 'El selector «' + v.selTxt + '» se repite en la celda «' + cel.texto + '».', 'variante_invalida'); vistos.add(clave);
        v.sel.forEach((g) => {
          const clases = new Set();
          g.forEach((e) => { const k = claseDe(e); if (!k) { if (!(/^V\d+$/.test(e) && (sinListaV))) E_(cel.loc.p, cel.loc.f, cel.loc.c, 'La etiqueta «' + e + '» no está en ninguna lista (versiones_plan, escenarios o tipos): celda «' + cel.texto + '».', 'variante_invalida'); } else clases.add(k); });
          if (clases.size > 1) E_(cel.loc.p, cel.loc.f, cel.loc.c, 'En «' + v.selTxt + '» se mezclan clases distintas con «,» (la coma es «o» dentro de una misma clase).', 'variante_invalida');
        });
        const cl = v.sel.map((g) => claseDe(g[0]));
        if (new Set(cl).size < cl.length) E_(cel.loc.p, cel.loc.f, cel.loc.c, 'En «' + v.selTxt + '» el «+» une dos etiquetas de la misma clase y nunca se cumple.', 'variante_invalida');
      });
      for (let a = 0; a < cel.vars.length; a++) for (let b = a + 1; b < cel.vars.length; b++) {
        const A = cel.vars[a], B = cel.vars[b];
        if (A.n !== B.n || A.texto === B.texto) continue;
        const porClase = (v) => { const o = {}; v.sel.forEach((g) => { const k = claseDe(g[0]); if (k) o[k] = new Set(g); }); return o; };
        const pa = porClase(A), pb = porClase(B);
        const compat = Object.keys(pa).every((k) => !pb[k] || Array.from(pa[k]).some((e) => pb[k].has(e)));
        if (compat) E_(cel.loc.p, cel.loc.f, cel.loc.c, 'Las variantes «' + A.selTxt + '» y «' + B.selTxt + '» pueden cumplirse a la vez con valores distintos (ambigua).', 'variante_ambigua');
      }
    };
    cn.forEach((c) => {
      if (c.referencia) checaSel(c.referencia.valor); if (c.rango) { checaSel(c.rango.min); checaSel(c.rango.max); checaSel(c.rango.paso); } checaSel(c.umbral);
      c.opciones.forEach((o) => checaSel(o.valor)); c.comps.forEach((m) => { checaSel(m.cantidad); checaSel(m.min); checaSel(m.max); checaSel(m.paso); checaSel(m.activoRef); });
      c.alertas.forEach((a) => checaSel(a.meta));
    });
    [tipo.maxAbiertas, tipo.maxSug, tipo.topeCorridas, tipo.topeMs].forEach(checaSel);
    const k_ = (cel, cx) => { if (!cel) return null; const v = constanteDe(elige(cel, cx)); return esNum(v) ? v : null; };
    cn.forEach((c) => {
      const n = c.raw, l = (cl) => loc('ARBOL_NODOS', n._fila, cl), vistoErr = new Set();
      const err1 = (clave, col, msg, cod) => { if (vistoErr.has(clave)) return; vistoErr.add(clave); E_('ARBOL_NODOS', n._fila, col, msg, cod); };
      ctxs.forEach((cx) => {
        if (!c.rango) return;
        const mn = k_(c.rango.min, cx), mx = k_(c.rango.max, cx), pa = k_(c.rango.paso, cx);
        const ctxTxt = cx.version || cx.escenario !== 'base' || cx.tipo !== tipoId ? ' (con ' + [cx.version, cx.escenario !== 'base' ? cx.escenario : null, cx.tipo !== tipoId ? cx.tipo : null].filter(Boolean).join(' + ') + ')' : '';
        if (mn !== null && mx !== null && !(mn < mx)) err1('inv' + ctxTxt, 'rango_min', 'El rango de ' + c.id + ' está al revés' + ctxTxt + ': el mínimo (' + mn + ') no es menor que el máximo (' + mx + ').', 'rango_invertido');
        if (pa !== null && !(pa > 0)) err1('paso' + ctxTxt, 'rango_paso', 'El paso del rango de ' + c.id + ' debe ser mayor que 0' + ctxTxt + '.', 'rango_invertido');
        if (c.referencia && c.referencia.valor) { const rv = k_(c.referencia.valor, cx); if (rv !== null && ((mn !== null && rv < mn) || (mx !== null && rv > mx))) err1('ref' + ctxTxt, 'referencia_valor', 'La referencia de ' + c.id + ' (' + rv + ') queda fuera de su rango ' + mn + ' a ' + mx + ctxTxt + '.', 'referencia_fuera_de_rango'); }
        c.opciones.forEach((op) => { const ov = k_(op.valor, cx); if (ov !== null && ((mn !== null && ov < mn) || (mx !== null && ov > mx))) err1('op' + op.clave + ctxTxt, 'rango_min', 'El valor de la opción «' + op.clave + '» de ' + c.id + ' (' + ov + ') queda fuera del rango ' + mn + ' a ' + mx + ctxTxt + '.', 'opcion_fuera_de_rango'); });
      });
      c.comps.forEach((m) => ctxs.forEach((cx) => {
        const mn = k_(m.min, cx), mx = k_(m.max, cx), q = k_(m.cantidad, cx);
        if (mn !== null && mx !== null && !(mn <= mx)) E_('ARBOL_COMPONENTES', m.fila, 'min', 'El rango del componente ' + m.clave + ' está al revés (mínimo ' + mn + ', máximo ' + mx + ').', 'rango_invertido');
        if (q !== null && ((mn !== null && q < mn) || (mx !== null && q > mx))) E_('ARBOL_COMPONENTES', m.fila, 'cantidad', 'La cantidad del componente ' + m.clave + ' (' + q + ') queda fuera de su rango ' + mn + ' a ' + mx + '.', 'cantidad_fuera_de_rango');
      }));
    });

    /* ── factores (ARBOL_FACTORES) ── */
    const factores = [];
    (cr.factores || []).forEach((f, q) => {
      const fila = f._fila || q + 2;
      const fa = {
        id: T(f.id), nombre: T(f.nombre), tarjetas: LISTA(f.tarjeta), campoVisor: T(f.campo_visor) || null, conversion: T(f.conversion_visor) || null, etiqueta: T(f.etiqueta_corta) || null,
        ordenTarjeta: T(f.orden_tarjeta) === '' || f.orden_tarjeta == null ? null : Number(f.orden_tarjeta), minimo: SI(f.minimo_tarjeta), correspondencia: T(f.correspondencia), origen: T(f.origen_maestro), claveLibro: T(f.clave_libro) || null
      };
      if (!fa.id) { E_('ARBOL_FACTORES', fila, 'id', 'Hay un factor sin ID.', 'campo_obligatorio'); return; }
      if (factores.some((x) => x.id === fa.id)) E_('ARBOL_FACTORES', fila, 'id', 'El factor «' + fa.id + '» está repetido.', 'id_repetido');
      if (['captura', 'formula'].indexOf(fa.origen) < 0) E_('ARBOL_FACTORES', fila, 'origen_maestro', 'El origen «' + fa.origen + '» del factor ' + fa.id + ' no es válido (captura o formula).', 'origen_invalido');
      if (['confirmada', 'pendiente', 'sin_equivalente'].indexOf(fa.correspondencia) < 0) E_('ARBOL_FACTORES', fila, 'correspondencia', 'La correspondencia «' + fa.correspondencia + '» del factor ' + fa.id + ' no es válida.', 'correspondencia_invalida');
      fa.tarjetas.forEach((t) => { if (TARJETAS.indexOf(t) < 0) E_('ARBOL_FACTORES', fila, 'tarjeta', 'La tarjeta «' + t + '» del factor ' + fa.id + ' no existe.', 'tarjeta_invalida'); });
      if (fa.conversion === '+1') {   // ola 5 (M5): los meses del árbol, del flujo y del visor ya cuentan desde 1; la conversión «+1» no existe. Una copia vieja de la tabla no rompe la carga, pero avisa y no se aplica.
        avisos.push({ pestana: 'ARBOL_FACTORES', fila, columna: 'conversion_visor', mensaje: 'El factor ' + fa.id + ' trae la conversión «+1», que ya no existe: los meses del árbol cuentan desde 1, igual que el flujo y el visor. No se aplica; borra el «+1» de la tabla.' });
        fa.conversion = null;
      } else if (fa.conversion && fa.conversion !== '/1000000') E_('ARBOL_FACTORES', fila, 'conversion_visor', 'La conversión «' + fa.conversion + '» no está soportada (solo /1000000).', 'conversion_invalida');
      if (fa.ordenTarjeta !== null && !isFinite(fa.ordenTarjeta)) E_('ARBOL_FACTORES', fila, 'orden_tarjeta', 'El orden de tarjeta de ' + fa.id + ' debe ser un número.', 'orden_invalido');
      factores.push(fa);
    });
    const pendientes = factores.filter((f) => f.correspondencia === 'pendiente').length;
    if (pendientes) avisos.push({ pestana: 'ARBOL_FACTORES', fila: 0, columna: 'correspondencia', mensaje: pendientes + ' factores siguen con correspondencia «pendiente» con el libro (se comprueba en la prueba de concordancia, no aquí).' });
    cn.forEach((c) => { if (maestro && ['se_decide', 'se_busca', 'regla_oficio'].indexOf(c.tipo) >= 0 && !factores.some((f) => f.id === c.id)) avisos.push({ pestana: 'ARBOL_FACTORES', fila: 0, columna: 'id', mensaje: 'El nodo ' + c.id + ' no tiene fila en ARBOL_FACTORES.' }); });
    /* ola 6: un umbral cuya referencia difiere del libro no bloquea nada; solo se avisa (los planes que no escriban otro quedan marcados «umbral propio») */
    PRUEBAS_LIBRO.forEach((p) => { const c = cn.find((q) => q.id === p.ru); if (!c || !c.referencia || !c.referencia.valor) return; const rv = k_(c.referencia.valor, ctxs[0]); if (rv !== null && Math.abs(rv - p.umbral) > 1e-9) avisos.push({ pestana: 'ARBOL_NODOS', fila: c.fila || 0, columna: 'referencia_valor', mensaje: 'El umbral ' + p.ru + ' trae ' + rv + ' de referencia y el libro pide ' + p.umbral + ': los planes que no escriban otro quedarán marcados como «umbral propio».' }); });
    /* umbrales de las alertas contra la copia de lectura de las 9 pruebas */
    PRUEBAS_LIBRO.forEach((p) => cn.forEach((c) => c.alertas.forEach((al) => {
      if (al.medida && al.medida.txt === p.id && al.pasaSi && al.meta) {
        const mv = k_(al.meta, ctxs[0]);
        if (mv !== null && (Math.abs(mv - p.umbral) > 1e-9 || al.pasaSi !== p.pasa)) avisos.push({ pestana: 'ARBOL_REGLAS', fila: al.fila, columna: 'meta', mensaje: 'La alerta ' + al.id + ' pide ' + al.pasaSi + ' ' + mv + ' pero la copia de lectura del libro tiene ' + p.pasa + ' ' + p.umbral + ' (se bloquea la publicación si difieren).' });
      }
    })));

    return { cn, ids, ix, kind, N, deps, orden, flujos, tipo, tipologias, rvIds, escribeDe, L, ctxs, factores, maestro, C, claseDe };
  }


  /* ═════════════════════════ BIBLIOTECA DE FLUJOS ═════════════════════════ */
  const TINY = 1;   // un peso: el «casi cero» del libro (1e-6 millones)
  const num = (f, E) => { if (!f) return null; const x = f(E); return esNum(x) ? x : null; };
  const esSi = (x) => x === 'si' || x === true || x === 1;

  /* Flujo mensual sin deuda (F-01): renglones puntual, parejo y cobranza_por_venta; mes 0 = hoy. */
  function flujoSimple(fl, E) {
    const base = fl.baseMes, M = fl.mesesMax, arr = new Array(M + 1 - base).fill(0);
    let fuera = 0; const add = (m, x) => { const k = m - base; if (k < 0 || k > M - base) { fuera += x; return; } arr[k] += x; };
    for (const rg of fl.renglones) {
      if (rg.perfil === 'config') continue;
      const signo = rg.signo === '+' ? 1 : -1, monto = num(rg.fMonto, E);
      if (monto === null) return { ok: false, motivo: 'sin_dato' };
      if (rg.perfil === 'puntual') { const d = num(rg.fDesde, E); if (d === null) return { ok: false, motivo: 'sin_dato' }; add(d, signo * monto); }
      else if (rg.perfil === 'parejo') {
        const d = num(rg.fDesde, E), h = num(rg.fHasta, E); if (d === null || h === null) return { ok: false, motivo: 'sin_dato' };
        const n = Math.max(1, h - d + 1); for (let m = d; m < d + n; m++) add(m, signo * monto / n);
      } else if (rg.perfil === 'cobranza_por_venta') {
        const p = {}; for (const k of PARAMS_PERFIL.cobranza_por_venta) { p[k] = num(rg.fPar[k], E); if (p[k] === null) return { ok: false, motivo: 'sin_dato' }; }
        const n = Math.max(1, Math.round(p.meses_venta)), per = monto / n;
        for (let s = p.inicio_ventas; s < p.inicio_ventas + n; s++) {
          add(s, signo * per * p.enganche);
          if (p.durante_obra > 0) { const a = s + 1, b = Math.max(s + 1, p.fin_obra), n2 = b - a + 1; for (let m = a; m <= b; m++) add(m, signo * per * p.durante_obra / n2); }
          add(Math.max(s, p.fin_obra) + p.rezago, signo * per * p.saldo);
        }
      }
    }
    let ult = arr.length - 1; while (ult > 0 && arr[ult] === 0) ult--;
    const fl2 = arr.slice(0, ult + 1);
    const acum = []; let a = 0; fl2.forEach((x) => { a += x; acum.push(a); });
    const tir = () => {
      const vpn = (i) => { const q = 1 / (1 + i); let v = 0; for (let t = fl2.length - 1; t >= 0; t--) v = v * q + fl2[t]; return v; };
      let lo = -0.9, hi = 1; if (!(vpn(lo) > 0) || !(vpn(hi) < 0)) return null;
      for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (vpn(mid) > 0) lo = mid; else hi = mid; }
      const r = Math.pow(1 + lo, 12) - 1; return isFinite(r) ? r : null;
    };
    return {
      ok: true, fuera, flujo: fl2, base,
      medida(nombre, arg) {
        switch (nombre) {
          case 'hoyo_maximo': { let h = 0; acum.forEach((x) => { if (x < h) h = x; }); return -h; }
          case 'tir_anual': return tir();
          case 'vpn': { if (!esNum(arg)) return null; const m = Math.pow(1 + arg, 1 / 12) - 1, q = 1 / (1 + m); let v = 0; for (let t = fl2.length - 1; t >= 0; t--) v = v * q + fl2[t]; return v; }
          case 'mes_recuperacion': { let im = 0, h = 0; acum.forEach((x, k) => { if (x < h) { h = x; im = k; } }); for (let k = im; k < acum.length; k++) if (acum[k] >= 0) return k + base; return null; }
          case 'serie_acumulada': return acum.slice();
          default: return null;
        }
      }
    };
  }

  /* Flujo del libro con capital, banco, respaldo, intereses, apertura y orden de pago (F-02, D7 §16.5). Unidades: pesos. Mes 1 = primer mes. */
  function flujoLibro(fl, E) {
    const M = fl.mesesMax, rows = fl.renglones, get = (p) => rows.find((r) => r.perfil === p);
    const cob = get('cobranza_libro'), obR = get('curva_obra'), inR = get('indirectos_libro'), imR = get('proporcional_a_obra'), coR = get('porcentaje_de_cobranza'), bk = get('banco_capital');
    if (!cob || !obR || !inR || !imR || !coR || !bk) return { ok: false, motivo: 'perfil_incompleto' };
    const P = (rg, k) => num(rg.fPar[k], E);
    const falla = { ok: false, motivo: 'sin_dato' };
    const eng = P(cob, 'enganche'), dob = P(cob, 'durante_obra'), indiv = P(cob, 'individualizar'), msal = P(cob, 'meses_saldos'), sp = P(cob, 'saldo_posterior'), ini = P(cob, 'inicio_ventas'), vm = P(cob, 'meses_venta'), fin = P(cob, 'fin_obra');
    const obraTot = num(obR.fMonto, E), ob_i = P(obR, 'inicio'), ob_d = P(obR, 'duracion'), camp = P(obR, 'desviacion');
    const ind = num(inR.fMonto, E), pre = P(inR, 'predesarrollo'), ipre = P(inR, 'parte_predesarrollo'), imp = num(imR.fMonto, E), com = num(coR.fMonto, E);
    if ([eng, dob, indiv, msal, sp, ini, vm, fin, obraTot, ob_i, ob_d, camp, ind, pre, ipre, imp, com].some((x) => x === null)) return falla;
    let cierreTot = 0, cierreMes = 1;
    for (const r of rows) if (r.perfil === 'puntual') { const x = num(r.fMonto, E); if (x === null) return falla; cierreTot += x; const d = num(r.fDesde, E); if (d !== null) cierreMes = d; }
    /* tipologías con datos */
    const U = [], pu = [], dO = [];
    for (const i of E.D.tipologias) {
      const u = E.get('P' + i + '-09'), p = E.get('P' + i + '-12');
      if (esNum(u) && esNum(p)) { U.push(u); pu.push(p); const fd = cob.fPar['durante_obra_' + i]; const xd = fd ? num(fd, E) : null; dO.push(xd === null ? dob : xd); }
    }
    if (!U.length) return falla;
    /* F15 (ola 6): lo que se vende aparte en áreas propias (E-18 m² por el precio por m² de la vivienda, igual que PT-07) entra a la cobranza
       como una tipología más, pero fraccionaria (m², sin redondear) y SIN contar como unidades: no suma a firmadas, preventa ni unidades del banco. */
    const nReal = U.length;
    { const xm2 = E.D.ix.has('E-18') ? E.get('E-18') : null, xp = E.D.ix.has('P1-06') ? E.get('P1-06') : null;
      if (esNum(xm2) && esNum(xp) && xm2 > 0 && xp > 0) { U.push(xm2); pu.push(xp); dO.push(dob); } }
    const unidades = (() => { const x = P(bk, 'unidades'); return x === null ? U.slice(0, nReal).reduce((a, b) => a + b, 0) : x; })();
    const usa = bk.fPar.usa_banco ? bk.fPar.usa_banco(E) : null;
    const usaBanco = esSi(usa);
    const capTope = P(bk, 'capital'), tc = P(bk, 'rendimiento'), cajamin = P(bk, 'caja_minima'), dev = esSi(bk.fPar.devolver_con_obra ? bk.fPar.devolver_con_obra(E) : 'si');
    let tasaB = P(bk, 'tasa_banco'), apert = P(bk, 'apertura'), linea = P(bk, 'linea');
    if (!usaBanco) { if (tasaB === null) tasaB = 0; if (apert === null) apert = 0; linea = 0; }
    if ([capTope, tc, cajamin, tasaB, apert, linea].some((x) => x === null)) return falla;
    const nt = U.length, z = () => new Float64Array(M + 1);
    /* Bloque 1 · cobranza */
    const firm = U.map((u, ix) => { const a = z(); if (ix >= nReal) { for (let m = 1; m <= M; m++) a[m] = u * (Math.min(Math.max(m - ini + 1, 0), vm) - Math.min(Math.max(m - ini, 0), vm)) / vm; return a; } for (let m = 1; m <= M; m++) a[m] = redondeaExcel(u * Math.min(Math.max(m - ini + 1, 0), vm) / vm, 0) - redondeaExcel(u * Math.min(Math.max(m - ini, 0), vm) / vm, 0); return a; });
    const totFirm = z(); for (let m = 1; m <= M; m++) { let s = 0; for (let i = 0; i < nReal; i++) s += firm[i][m]; totFirm[m] = s; }
    const curva = z(); let sc = 0;
    for (let m = 1; m <= M; m++) if (ob_i <= m && m <= ob_i + ob_d - 1) { const d = (m - (ob_i + (ob_d - 1) / 2)) / (camp * ob_d); curva[m] = Math.exp(-0.5 * d * d); sc += curva[m]; }
    const obraM = z(), obraAc = z(), share = z();
    for (let m = 1; m <= M; m++) { share[m] = sc > 0 ? curva[m] / sc : 0; obraM[m] = obraTot * share[m]; obraAc[m] = obraAc[m - 1] + obraM[m]; }
    let ms;
    if (indiv >= 1) ms = fin; else { const buscado = indiv * obraTot; let pos = 0; for (let m = 1; m <= M; m++) if (obraAc[m] <= buscado) pos = m; ms = pos + 1; }
    const sumPu = (arr, m) => { let s = 0; for (let i = 0; i < nt; i++) s += pu[i] * arr[i][m]; return s; };
    const sumPuDo = (arr, m) => { let s = 0; for (let i = 0; i < nt; i++) s += pu[i] * dO[i] * arr[i][m]; return s; };
    const f54 = z(), f15 = z();
    for (let m = 1; m <= M; m++) f54[m] = m < ms ? sumPuDo(firm, m) / (ms - m) : 0;
    { let run = 0; for (let m = 2; m <= M; m++) { run += f54[m - 1]; f15[m] = m <= ms ? run : 0; } }
    let B15 = 0; for (let m = 1; m <= M; m++) B15 += f15[m];
    let firmaHasta = 0; for (let i = 0; i < nt; i++) { let s = 0; for (let m = 1; m <= Math.min(ms, M); m++) s += firm[i][m]; firmaHasta += pu[i] * s; }
    const saldInd = (1 - eng) * firmaHasta - B15;
    const f13 = z(), f14 = z(), f16 = z();
    for (let m = 1; m <= M; m++) {
      f13[m] = eng * sumPu(firm, m);
      let v = 0;
      if (m > ms && m <= ms + msal) v += saldInd / msal;
      if (m - sp > ms && m - sp >= 1) v += (1 - eng) * sumPu(firm, m - sp);
      f14[m] = v; f16[m] = f13[m] + f14[m] + f15[m];
    }
    /* Bloque 2 · egresos */
    const f21 = z(), f22 = z(), f23 = z(), f24 = z(), f25 = z();
    for (let m = 1; m <= M; m++) {
      f21[m] = (m <= pre ? ipre * ind / pre : 0) + (1 - ipre) * ind * share[m];
      f22[m] = imp * share[m]; f23[m] = com * f16[m]; f24[m] = m === cierreMes ? cierreTot : 0;
      f25[m] = obraM[m] + f21[m] + f22[m] + f23[m] + f24[m];
    }
    /* Bloques 3 y 4 · dinero */
    const f28 = z(), f29 = z(), f30 = z(), f31 = z(), f32 = z(), f33 = z(), f34 = z(), f35 = z(), f36 = z(), f37 = z(), f38 = z(), f39 = z(), f40 = z(), f41 = z(), f42 = z(), f43 = z(), f45 = z(), f48 = z(), f52 = new Array(M + 1).fill(null), f57 = z(), porCobrar = z(), cuadra = z(), f27 = z(), f49 = z();
    for (let m = 0; m <= M; m++) f27[m] = obraTot > 0 ? obraAc[m] / obraTot : 0;
    let cuadraTot = 0;
    for (let m = 1; m <= M; m++) {
      const p = m - 1;
      f28[m] = m >= ob_i ? cajamin : 0;
      f29[m] = m === 1 ? 0 : f41[p] * tasaB / 12;
      f30[m] = f25[m] + f29[m] - f16[m] - (m === 1 ? 0 : f45[p]) + f28[m];
      f31[m] = Math.max(0, Math.min(f30[m], capTope - (m === 1 ? 0 : f32[p]))); f32[m] = (m === 1 ? 0 : f32[p]) + f31[m];
      if (m === 1) { f33[m] = 0; f34[m] = 0; f35[m] = 0; f36[m] = 0; f38[m] = 0; f39[m] = 0; f40[m] = 0; f41[m] = 0; f42[m] = f31[m]; }
      else {
        f33[m] = linea * f27[p];
        f34[m] = (f30[m] - f31[m] > 0 && f33[m] - f36[p] > 0 && f36[p] === 0) ? apert * linea : 0;
        f35[m] = Math.min(Math.max(0, f30[m] - f31[m]) + f34[m], Math.max(0, f33[m] - f36[p]));
        f36[m] = f36[p] + f35[m];
        f38[m] = Math.min(Math.max(0, -f30[m]), f41[p]);
        const libre = (f41[p] - f38[m] <= TINY) && (!dev || m > fin);
        f39[m] = libre ? Math.min(Math.max(0, -f30[m]) - f38[m], f43[p] * (1 + tc / 12)) : 0;
        f40[m] = libre ? Math.min(Math.max(0, -f30[m]) - f38[m] - f39[m], f42[p] * (1 + tc / 12)) : 0;
        f41[m] = f41[p] + f35[m] - f38[m];
        f42[m] = f42[p] * (1 + tc / 12) + f31[m] - f40[m];
      }
      f37[m] = Math.max(0, f30[m] - f31[m]) + f34[m] - f35[m];
      f43[m] = m === 1 ? f37[m] - f39[m] : f43[p] * (1 + tc / 12) + f37[m] - f39[m];
      f45[m] = f28[m] + Math.max(0, -f30[m]) - f38[m] - f39[m] - f40[m];
      f48[m] = f16[m] - f25[m] - f29[m] - f34[m];
      f49[m] = (m === 1 ? 0 : f49[p]) + f48[m];
      porCobrar[m] = (m === 1 ? 0 : porCobrar[p]) + sumPu(firm, m) - f16[m];
      f52[m] = f41[m] > TINY ? porCobrar[m] / f41[m] : null;
      f57[m] = f41[m] + f32[m] + f43[m];
      cuadra[m] = f45[m] - (m === 1 ? 0 : f45[p]) - (f48[m] + f31[m] + f35[m] + f37[m] - f38[m] - f39[m] - f40[m]);
      cuadraTot += Math.abs(cuadra[m]);
    }
    let maxB = 0, maxC = 0, sumResp = 0, maxRespSaldo = 0, maxAjeno = 0, lastBank = 0, prim = null, sumF29 = 0, sumF34 = 0, sumF31 = 0, sumF39 = 0, sumF37 = 0, sumF40 = 0, cobMin = null, firmadas = 0, preInicio = 0, cobTotal = 0;
    for (let m = 1; m <= M; m++) {
      if (f41[m] > maxB) maxB = f41[m]; if (f32[m] > maxC) maxC = f32[m]; sumResp += f37[m]; if (f43[m] > maxRespSaldo) maxRespSaldo = f43[m]; if (f57[m] > maxAjeno) maxAjeno = f57[m];
      if (f41[m] > TINY) lastBank = m; if (prim === null && f36[m] > TINY) prim = m;
      sumF29 += f29[m]; sumF34 += f34[m]; sumF31 += f31[m]; sumF39 += f39[m]; sumF37 += f37[m]; sumF40 += f40[m];
      if (f52[m] !== null && (cobMin === null || f52[m] < cobMin)) cobMin = f52[m];
      firmadas += totFirm[m]; if (m < ob_i) preInicio += totFirm[m]; cobTotal += f16[m];
    }
    let preDesem = null; if (prim !== null) { preDesem = 0; for (let m = 1; m < prim; m++) preDesem += totFirm[m]; preDesem /= unidades; }
    const totalU = U.slice(0, nReal).reduce((a, b) => a + b, 0);
    const med = {
      banco_maximo: maxB, capital_aportado: maxC, respaldo_faltante: sumResp, respaldo_saldo_maximo: maxRespSaldo, dinero_ajeno_maximo: maxAjeno,
      mes_liquidacion_banco: lastBank > 0 ? lastBank + 1 : null, primer_desembolso: prim, preventa_al_inicio_obra: preInicio / unidades, preventa_al_desembolso: preDesem,
      cobertura_minima: cobMin, costo_dinero: sumF29 + sumF34 + (sumF40 - sumF31) + (sumF39 - sumF37), caja_cierre: f45[M] - f41[M] - f42[M] - f43[M], pagos_durante_obra: B15,
      rendimiento_capital: sumF40 - sumF31, fuera_horizonte: Math.max(0, redondeaExcel(totalU - firmadas, 6)), cuadra: cuadraTot
    };
    const cum48 = f49;
    const SERIES = { firmas: totFirm, enganches: f13, saldos: f14, pagos_obra: f15, cobranza: f16, obra: obraM, indirectos: f21, imprevistos: f22, comisiones: f23, cierre: f24, egresos: f25, caja_minima: f28, interes: f29, cap_aporta: f31, cap_acum: f32, apertura: f34, disposicion: f35, respaldo: f37, pago_banco: f38, pago_respaldo: f39, pago_capital: f40, saldo_banco: f41, saldo_capital: f42, saldo_respaldo: f43, caja: f45, flujo_acum: cum48, ajeno: f57 };
    return {
      ok: true, M, base: 1, ms, cobranzaTotal: cobTotal, series: SERIES, med,
      medida(nombre, arg) {
        if (nombre === 'serie') { const s = SERIES[arg]; return s ? Array.prototype.slice.call(s, 1) : null; }
        if (Object.prototype.hasOwnProperty.call(med, nombre)) return nn(med[nombre]);
        return null;
      }
    };
  }


  /* ═════════════════════════ NÚCLEO: una evaluación completa ═════════════════════════ */
  const firmeE = (e) => e === 'decidido' || e === 'confirmado';
  /* Un número escrito o sugerido en un «se busca» / «regla del oficio» no es el dato real confirmado (D7 2.2): sigue «por confirmar». */
  const valorPropio = (E, c) => {
    if (c.tipo !== 'se_busca' && c.tipo !== 'regla_oficio') return false;
    if (E.est[c.i] !== 'decidido') return false;
    const reg = ((E.plan && E.plan.valores) || {})[c.id];
    return !!reg && (reg.marca === 'valor_propio' || reg.marca === 'sugerido');
  };
  const pideValor = (c) => c.tipo === 'se_busca' || c.tipo === 'regla_oficio' || c.tipo === 'se_decide';

  function fmtValor(c, x) {
    if (x === null || x === undefined) return '—';
    if (typeof x === 'string') return x;
    if (typeof x === 'boolean') return x ? 'sí' : 'no';
    if (!c) return Number.isInteger(x) ? miles(x, 0) : miles(x, 2);
    const cl = c.unidad.clase;
    if (cl === 'pct') return String(Math.round(x * 1000) / 10) + '%';
    if (cl === 'm2') return miles(Math.round(x), 0);
    if (cl === 'mxn') { const neg = x < 0 ? '-' : ''; x = Math.abs(x); return c.escala && c.escala >= 1e6 ? neg + '$' + miles(x / c.escala, 1) + ' M' : neg + '$' + miles(Math.round(x), 0); }
    if (cl === 'mxn_m2') return (x < 0 ? '-' : '') + '$' + miles(Math.abs(Math.round(x)), 0);
    if (cl === 'veces') return x.toFixed(2);
    if (cl === 'u_mes') return x.toFixed(1);
    if (cl === 'si_no') return x === 'si' ? 'sí' : x;
    if (cl === 'n1') return miles(Math.round(x * 10) / 10, Number.isInteger(Math.round(x * 10) / 10) ? 0 : 1);
    return Number.isInteger(x) ? miles(x, 0) : miles(Math.round(x * 100) / 100, 1);
  }

  /* da formato a un valor en unidades del FACTOR; si el nodo tiene `vista`, lo convierte primero a la vista (la clase de unidad describe lo que ve la persona) */
  function fmtF(E, c, f) {
    if (c && c.vista && esNum(f)) return fmtValor(c, factorAVista(E, c, f));
    return fmtValor(c, f);
  }

  class Entorno {
    constructor(D, plan, ctx) {
      this.D = D; this.plan = plan; this.ctx = ctx; const N = D.N; this.N = N;
      this.v = new Array(N); this.est = new Array(N); this.opc = new Array(N); this.rf = new Array(N); this.mn = new Array(N); this.mx = new Array(N); this.pa = new Array(N);
      this.vis = new Uint8Array(N); this.firm = new Array(N); this.comps = new Array(N); this.notas = new Array(N); this.fuera = new Array(N); this.motivo = new Array(N); this.refAj = new Array(N);
      this.vv = undefined; this.cacheFlujo = {}; this.cacheReparto = undefined; this.abiertas = []; this.esperan = []; this.reabiertas = []; this.avisosAreas = [];
    }
    reinicia() {
      const N = this.N;
      for (let i = 0; i < N; i++) { this.v[i] = null; this.est[i] = null; this.opc[i] = null; this.rf[i] = null; this.mn[i] = null; this.mx[i] = null; this.pa[i] = null; this.vis[i] = 0; this.firm[i] = true; this.comps[i] = null; this.notas[i] = null; this.fuera[i] = false; this.motivo[i] = null; this.refAj[i] = null; }
      this.cacheFlujo = {}; this.cacheReparto = undefined; this.abiertas = []; this.esperan = []; this.reabiertas = []; this.avisosAreas = [];
    }
    get(id) { const i = this.D.ix.get(id); return i === undefined ? null : (this.v[i] === undefined ? null : this.v[i]); }
    flujo(fid, medida, arg) {
      let r = this.cacheFlujo[fid];
      if (r === undefined) { const fl = this.D.flujos[fid]; r = fl ? (fl.libro ? flujoLibro(fl, this) : flujoSimple(fl, this)) : { ok: false }; this.cacheFlujo[fid] = r; }
      return r.ok ? nn(r.medida(medida, arg)) : null;
    }
    fuentesDifieren(i) {
      const c = this.D.cn[i]; if (!c || !c.fuentes) return false;
      if (!(this.est[i] === 'referencia' || this.est[i] === 'no_se' || this.est[i] === 'reabierto')) return false;
      const vs = c.opciones.map((o) => { const f = elige(o.valor, this.ctx); const x = f ? f(this) : null; return esNum(x) ? x : null; }).filter((x) => x !== null);
      return vs.length >= 2 && vs.some((x) => Math.abs(x - vs[0]) > 1e-12);
    }
    cuentaPendientes() {
      let n = 0; const D = this.D;
      for (let i = 0; i < this.N; i++) { const c = D.cn[i]; if (c && this.vis[i] && pideValor(c) && !c.raiz && this.v[i] != null && (!firmeE(this.est[i]) || valorPropio(this, c))) n++; }
      return n;
    }
    revision() {
      const D = this.D, items = [];
      const vigente = (id, libro) => { const j = id ? D.ix.get(id) : undefined; return j !== undefined && D.kind[j] === 'nodo' && this.vis[j] && esNum(this.v[j]) ? this.v[j] : libro; };
      for (const p of PRUEBAS_LIBRO) {
        const i = D.ix.get(p.id); const v = i === undefined || !this.vis[i] ? null : this.v[i];
        const um = vigente(p.ru, p.umbral), justa = p.justaHasta !== undefined ? vigente(p.ruJusta, p.justaHasta) : undefined;
        const propio = Math.abs(um - p.umbral) > 1e-9 || (justa !== undefined && Math.abs(justa - p.justaHasta) > 1e-9);
        const it = { n: p.n, id: p.id, valor: v, umbral: um, pasa_si: p.pasa, estado: 'na', motivo: null, umbral_libro: p.umbral, umbral_propio: propio, umbral_texto: textoUmbral(p, um), umbral_libro_texto: textoUmbral(p, p.umbral),
          nota: propio ? 'umbral propio; el libro pide ' + textoUmbral(p, p.umbral) + (justa !== undefined && Math.abs(justa - p.justaHasta) > 1e-9 ? ' (y «justa» hasta ' + String(Math.round(p.justaHasta * 1000) / 10) + '%)' : '') : null };
        if (justa !== undefined) { it.justa_hasta = justa; it.justa_hasta_libro = p.justaHasta; }
        if (v === null) it.motivo = 'sin_dato';
        else if (typeof v === 'string') it.motivo = 'sin_banco';
        else if (esNum(v)) {
          const ok = p.pasa === '<=' ? v <= um : p.pasa === '>=' ? v >= um : p.pasa === '<' ? v < um : v > um;
          it.estado = ok ? (justa !== undefined && v < justa ? 'justa' : 'ok') : 'fuera';
        }
        items.push(it);
      }
      /* si hay banco pero nunca se usa, la medida queda vacía y la prueba no falla (el libro deja la celda vacía) */
      const r2 = this.cacheFlujo[D.tipo.flujoBanco || 'F-02'];
      const usaBanco = D.ix.has('D-09') ? this.get('D-09') === 'si' : false;
      items.forEach((it) => { if (it.motivo === 'sin_dato' && r2 && r2.ok && usaBanco && ['RV-03', 'RV-08', 'RV-09'].indexOf(it.id) >= 0) it.motivo = 'banco_sin_uso'; });
      return items;
    }
    visInter(id) { const i = this.D.ix.get(id); return i !== undefined && this.vis[i] === 1; }
    fallasRevision() {
      const it = this.revision(); if (it.some((x) => x.motivo === 'sin_dato')) return null;
      return it.filter((x) => x.estado === 'fuera').length;
    }
    resultadoRevision() {
      const it = this.revision();
      if (it.every((x) => x.motivo === 'sin_dato')) return null;
      if (it.some((x) => x.motivo === 'sin_dato')) return 'Falta calcular';
      const f = it.filter((x) => x.estado === 'fuera').length;
      if (f > 0) return 'No pasa: ' + f + ' de 9 pruebas';
      return it.some((x) => x.estado === 'justa') ? 'Pasa (aportación justa)' : 'Pasa';
    }
    sumaComp(i, rol) {
      const cs = this.comps[i]; if (!cs) return null; let s = 0;
      for (const m of cs) { if (m.rol !== rol || !m.activo) continue; if (!esNum(m.m2)) return null; s += m.m2; }
      return s;
    }
    cuentaComp(i, rol) { const cs = this.comps[i]; if (!cs) return null; let n = 0; for (const m of cs) if (m.rol === rol && m.activo) n++; return n; }
    compCampo(i, clave, campo) {
      const cs = this.comps[i]; if (!cs) return null; const m = cs.find((x) => x.clave === clave); if (!m) return null;
      if (campo === 'activo') return m.activo ? 'si' : 'no';
      if (!m.activo) return 0;
      return campo === 'm2' ? nn(m.m2) : campo === 'pct' ? nn(m.pct) : null;
    }
  }

  /* conversiones entre la vista y el factor */
  function defAFactor(E, c, x) {   // número escrito en la definición (en unidades de la vista solo si el nodo tiene `vista`)
    if (!esNum(x)) return x;
    if (c.vista && c.vista.fa) { const old = E.vv; E.vv = x; const r = c.vista.fa(E); E.vv = old; return esNum(r) ? r : null; }
    return x;
  }
  function planAFactor(E, c, v) {   // valor que viene del plan o del cambio (en unidades de la vista)
    if (!esNum(v)) return v;
    if (c.vista && c.vista.fa) { const old = E.vv; E.vv = v; const r = c.vista.fa(E); E.vv = old; return esNum(r) ? r : null; }
    return c.escala ? v * c.escala : v;
  }
  function factorAVista(E, c, f) {
    if (!esNum(f)) return f === undefined ? null : f;
    if (c.vista && c.vista.fd) { const old = E.v[c.i]; E.v[c.i] = f; const r = c.vista.fd(E); E.v[c.i] = old; return esNum(r) ? r : null; }
    return c.escala ? f / c.escala : f;
  }
  const evalCel = (E, cel) => { if (!cel) return null; const f = elige(cel, E.ctx); const x = f ? f(E) : null; return x === undefined ? null : x; };

  /* ── ola 6 (decisión D): áreas del edificio personalizables por plan ──
     Dónde viajan: plan.componentes[nodo][clave]. Para un área del catálogo: { activo, valor, unidad, estado, fuente, nombre } (nombre = renombrada).
     Para un área AGREGADA por la persona: { propia: true, nombre, rol: 'no_vendible' | 'vendible', valor, unidad: 'm2' | 'pct', estado, fuente }, con clave «ap_01»…«ap_99».
     Quitar una propia: { quitar: true }. Todo se valida aquí, en un solo lugar (el cambio de la persona, el plan que llega guardado y la celda del Maestro). */
  const AREAS = { max_propias: 8, nombre_min: 2, nombre_max: 30, fuente_max: 60, celda_max: 1000, m2_max: 2000, pct_max: 0.3, roles: ['no_vendible', 'vendible'], unidades: ['m2', 'pct'], estados: ['referencia', 'decidido', 'confirmado'], clave_propia: /^ap_\d{2}$/ };
  const llaveNombre = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  function validaNombreArea(texto, usados) {   // usados: nombres que ya existen en el mismo edificio (sin el del área que se valida)
    if (typeof texto !== 'string') return { ok: false, codigo: 'nombre_invalido', mensaje: 'El nombre del área debe ser texto.' };
    const nombre = texto.replace(/\s+/g, ' ').trim();
    if (/[<>]/.test(nombre) || /&\s*[#a-z0-9]+;/i.test(nombre)) return { ok: false, codigo: 'nombre_invalido', mensaje: 'El nombre del área no puede llevar HTML (nada entre < y >).' };
    if (nombre.length < AREAS.nombre_min) return { ok: false, codigo: 'nombre_invalido', mensaje: 'El nombre del área necesita al menos ' + AREAS.nombre_min + ' letras.' };
    if (nombre.length > AREAS.nombre_max) return { ok: false, codigo: 'nombre_invalido', mensaje: 'El nombre del área mide ' + nombre.length + ' caracteres y el máximo es ' + AREAS.nombre_max + '.' };
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .,()\/+#°ºª'’\-]*$/u.test(nombre)) return { ok: false, codigo: 'nombre_invalido', mensaje: 'El nombre del área solo admite letras, números, espacios y . , ( ) / + # - (sin comillas ni signos como = | ; : & < >).' };
    const k = llaveNombre(nombre);
    if ((usados || []).some((u) => llaveNombre(u) === k)) return { ok: false, codigo: 'nombre_duplicado', mensaje: 'Ya hay un área llamada «' + nombre + '» en este edificio.' };
    return { ok: true, nombre };
  }
  function validaFuenteArea(texto) {
    if (texto === undefined || texto === null || texto === '') return { ok: true, fuente: undefined };
    if (typeof texto !== 'string') return { ok: false, mensaje: 'La fuente debe ser texto.' };
    const f = texto.replace(/\s+/g, ' ').trim();
    if (f.length > AREAS.fuente_max) return { ok: false, mensaje: 'La fuente mide ' + f.length + ' caracteres y el máximo es ' + AREAS.fuente_max + '.' };
    if (/[<>|;=]/.test(f)) return { ok: false, mensaje: 'La fuente no puede llevar < > | ; =.' };
    return { ok: true, fuente: f || undefined };
  }
  /* Valida un área propia completa; devuelve {ok, area} con valores normalizados, o {ok:false, codigo, mensaje}. */
  function validaAreaPropia(clave, ed, usados) {
    if (!AREAS.clave_propia.test(clave)) return { ok: false, codigo: 'componente_desconocido', mensaje: 'La clave «' + clave + '» no sirve para un área propia: usa ap_01, ap_02… (hasta ap_99).' };
    const nm = validaNombreArea(ed.nombre, usados); if (!nm.ok) return nm;
    const rol = ed.rol === undefined || ed.rol === null ? 'no_vendible' : ed.rol;
    if (AREAS.roles.indexOf(rol) < 0) return { ok: false, codigo: 'area_invalida', mensaje: 'Di si el área se vende (vendible) o no (no_vendible).' };
    const unidad = ed.unidad === undefined || ed.unidad === null ? 'm2' : ed.unidad;
    if (AREAS.unidades.indexOf(unidad) < 0) return { ok: false, codigo: 'area_invalida', mensaje: 'El tamaño del área va en m² (m2) o en % de la construcción (pct).' };
    let valor = ed.valor; if (typeof valor === 'string' && valor.trim() !== '' && isFinite(Number(valor))) valor = Number(valor);
    if (!esNum(valor) || valor < 0) return { ok: false, codigo: 'area_invalida', mensaje: 'Escribe el tamaño del área como un número de 0 en adelante.' };
    const tope = unidad === 'm2' ? AREAS.m2_max : AREAS.pct_max; let ajuste = null;
    if (valor > tope) { ajuste = 'El tamaño de «' + nm.nombre + '» se ajustó al máximo (' + (unidad === 'm2' ? tope + ' m²' : Math.round(tope * 100) + '% de la construcción') + ').'; valor = tope; }
    const fu = validaFuenteArea(ed.fuente); if (!fu.ok) return { ok: false, codigo: 'area_invalida', mensaje: fu.mensaje };
    let estado = ed.estado === undefined || ed.estado === null || ed.estado === 'editado' ? 'decidido' : ed.estado;
    if (AREAS.estados.indexOf(estado) < 0) return { ok: false, codigo: 'area_invalida', mensaje: 'El estado del área es referencia, decidido o confirmado.' };
    let degradado = null;
    if (estado === 'confirmado' && !fu.fuente) { estado = 'decidido'; degradado = 'Para confirmar «' + nm.nombre + '» hay que decir de dónde sale el dato; se guardó como decidido.'; }
    const area = { propia: true, nombre: nm.nombre, rol, valor, unidad, estado }; if (fu.fuente) area.fuente = fu.fuente;
    return { ok: true, area, ajuste, degradado };
  }
  const estadoPlanDe = (est) => (est === 'confirmado' ? 'confirmado' : est === 'referencia' ? 'referencia' : 'decidido');

  /* La celda con código del Maestro (factor E-19): entradas separadas por «|»; cada una «clave = nombre ; cantidad ; venta ; estado ; fuente».
     Un área del catálogo solo puede llevar «clave = nombre» (renombre). Las propias llevan al menos nombre y cantidad. */
  function areasACelda(ediciones) {
    const ed = ediciones || {}, partes = [], errores = [];
    const claves = Object.keys(ed).filter((k) => (ed[k] && ed[k].propia) || (ed[k] && typeof ed[k].nombre === 'string' && ed[k].nombre.trim() !== '' && !ed[k].propia)).sort();
    claves.forEach((k) => {
      const x = ed[k];
      if (x.propia) {
        const v = validaAreaPropia(k, x, []); if (!v.ok) { errores.push({ clave: k, mensaje: v.mensaje }); return; }
        const a = v.area, num = (n) => String(Math.round(n * 1e6) / 1e6);
        const cant = a.unidad === 'm2' ? num(a.valor) + ' m2' : num(a.valor * 100) + '%';
        partes.push(k + ' = ' + a.nombre + ' ; ' + cant + ' ; ' + (a.rol === 'vendible' ? 'se vende' : 'no se vende') + ' ; ' + a.estado + (a.fuente ? ' ; ' + a.fuente : ''));
      } else {
        const nm = validaNombreArea(x.nombre, []); if (!nm.ok) { errores.push({ clave: k, mensaje: nm.mensaje }); return; }
        partes.push(k + ' = ' + nm.nombre);
      }
    });
    const celda = partes.join(' | ');
    if (celda.length > AREAS.celda_max) errores.push({ clave: null, mensaje: 'La celda mide ' + celda.length + ' caracteres y el máximo es ' + AREAS.celda_max + '.' });
    return { celda, errores };
  }
  function celdaAAreas(texto, catalogoClaves, catalogoNombres) {
    const ediciones = {}, errores = [];
    const t = texto === undefined || texto === null ? '' : String(texto);
    if (t.trim() === '') return { ediciones, errores };
    if (t.length > AREAS.celda_max) { errores.push({ entrada: null, mensaje: 'La celda mide ' + t.length + ' caracteres y el máximo es ' + AREAS.celda_max + '.' }); return { ediciones, errores }; }
    const usados = (catalogoNombres || []).slice(); let propias = 0;
    t.split('|').forEach((cruda, q) => {
      const ent = cruda.trim(); if (ent === '') return;
      const eq = ent.indexOf('='); if (eq < 0) { errores.push({ entrada: q + 1, mensaje: 'La entrada ' + (q + 1) + ' no trae «clave = nombre».' }); return; }
      const clave = ent.slice(0, eq).trim(), campos = ent.slice(eq + 1).split(';').map((x) => x.trim());
      if (ediciones[clave]) { errores.push({ entrada: q + 1, mensaje: 'La clave «' + clave + '» se repite.' }); return; }
      if (AREAS.clave_propia.test(clave)) {
        if (propias >= AREAS.max_propias) { errores.push({ entrada: q + 1, mensaje: 'Hay más de ' + AREAS.max_propias + ' áreas propias.' }); return; }
        const ed = { propia: true, nombre: campos[0] };
        const cm = /^([0-9]+(?:\.[0-9]+)?)\s*(m2|m²|%)$/i.exec(campos[1] || '');
        if (!cm) { errores.push({ entrada: q + 1, mensaje: 'La cantidad de «' + clave + '» debe ser «25 m2» o «3%».' }); return; }
        if (cm[2] === '%') { ed.unidad = 'pct'; ed.valor = Number(cm[1]) / 100; } else { ed.unidad = 'm2'; ed.valor = Number(cm[1]); }
        const venta = (campos[2] || 'no se vende').toLowerCase();
        if (venta !== 'se vende' && venta !== 'no se vende') { errores.push({ entrada: q + 1, mensaje: 'Di «se vende» o «no se vende» en «' + clave + '».' }); return; }
        ed.rol = venta === 'se vende' ? 'vendible' : 'no_vendible';
        ed.estado = (campos[3] || 'decidido').toLowerCase(); if (campos[4]) ed.fuente = campos[4];
        if (campos.length > 5) { errores.push({ entrada: q + 1, mensaje: 'La entrada «' + clave + '» trae más campos de los que cabe (nombre, cantidad, venta, estado, fuente).' }); return; }
        const v = validaAreaPropia(clave, ed, usados); if (!v.ok) { errores.push({ entrada: q + 1, mensaje: v.mensaje }); return; }
        usados.push(v.area.nombre); propias++; ediciones[clave] = v.area;
      } else {
        if (campos.length !== 1) { errores.push({ entrada: q + 1, mensaje: 'Un área del catálogo solo lleva «clave = nombre» (renombre).' }); return; }
        if (catalogoClaves && catalogoClaves.indexOf(clave) < 0) { errores.push({ entrada: q + 1, mensaje: 'La clave «' + clave + '» no es un área del catálogo ni una propia (ap_01…).' }); return; }
        const nm = validaNombreArea(campos[0], usados); if (!nm.ok) { errores.push({ entrada: q + 1, mensaje: nm.mensaje }); return; }
        usados.push(nm.nombre); ediciones[clave] = { nombre: nm.nombre };
      }
    });
    return { ediciones, errores };
  }
  /* la siguiente clave libre para un área propia: «ap_01», «ap_02»… */
  function nuevaClaveArea(ediciones) {
    for (let k = 1; k <= 99; k++) { const c = 'ap_' + String(k).padStart(2, '0'); if (!ediciones || !ediciones[c]) return c; }
    return null;
  }

  /* ── componentes de un nodo compuesto (D7 §17) ── */
  function construyeComps(E, c, presetKey, ediciones, idxNodo) {
    const preset = presetKey ? c.opciones.find((o) => o.clave === presetKey) : null;
    const baseNodo = (c.comps.find((x) => x.base) || {}).base || null;   // un componente en m² también se puede ver como % de la misma base
    const bi0 = baseNodo ? E.D.ix.get(baseNodo) : undefined, baseNodoV = bi0 === undefined ? null : E.v[bi0];
    const avisa = (clave, texto) => { if (E.avisosAreas) E.avisosAreas.push({ i: idxNodo === undefined ? c.i : idxNodo, clave, texto }); };
    /* nombres vigentes del catálogo (con los renombres que valen), para detectar duplicados contra las áreas propias */
    const nombresCat = {};
    c.comps.forEach((m) => { nombresCat[m.clave] = m.nombre; });
    c.comps.forEach((m) => {
      const ed = ediciones && ediciones[m.clave]; if (!ed || typeof ed.nombre !== 'string' || ed.nombre.trim() === '') return;
      const v = validaNombreArea(ed.nombre, Object.keys(nombresCat).filter((k) => k !== m.clave).map((k) => nombresCat[k]).concat(Object.keys(ediciones).filter((k) => ediciones[k] && ediciones[k].propia && typeof ediciones[k].nombre === 'string').map((k) => ediciones[k].nombre)));
      if (v.ok) nombresCat[m.clave] = v.nombre; else avisa(m.clave, 'El nuevo nombre de «' + m.nombre + '» no sirve y se dejó el de siempre: ' + v.mensaje);
    });
    const res = c.comps.map((m) => {
      const listado = preset && preset.componentes ? preset.componentes.find((q) => q.clave === m.clave) : null;
      let activo = preset && preset.componentes ? !!listado : evalCel(E, m.activoRef) === 'si';
      let cant = listado && listado.cant ? evalCel(E, listado.cant) : evalCel(E, m.cantidad);
      let unidad = m.unidad, estado = 'referencia', fuente = m.fuente;
      const ed = ediciones && ediciones[m.clave];
      const nombre = nombresCat[m.clave], renombrada = nombre !== m.nombre;
      if (ed && (ed.activo !== undefined || ed.valor !== undefined || ed.estado !== undefined || ed.fuente !== undefined)) {
        if (ed.activo !== undefined && ed.activo !== null) activo = !!ed.activo;
        if (ed.valor !== undefined && ed.valor !== null && esNum(ed.valor)) { cant = ed.valor; unidad = ed.unidad || m.unidad; }
        estado = ed.estado === 'confirmado' ? 'confirmado' : 'editado'; if (ed.fuente) fuente = ed.fuente;
      }
      const bi = (m.base || baseNodo) ? E.D.ix.get(m.base || baseNodo) : undefined, baseV = bi === undefined ? null : E.v[bi];
      let m2 = null, pct = null;
      if (esNum(cant)) {
        if (unidad === 'm2') m2 = cant; else if (unidad === 'n') m2 = cant * (m.m2u || 0); else if (unidad === 'pct') m2 = esNum(baseV) ? cant * baseV : null;
      }
      if (esNum(m2) && esNum(baseV) && baseV > 0) pct = m2 / baseV; else if (unidad === 'pct' && esNum(cant)) pct = cant;
      if (!activo) { m2 = 0; pct = 0; }
      return { clave: m.clave, nombre, nombre_catalogo: m.nombre, renombrada, propia: false, rol: m.rol, activo, cantidad: cant, unidad_base: unidad, unidad_catalogo: m.unidad, m2, pct, min: evalCel(E, m.min), max: evalCel(E, m.max), paso: evalCel(E, m.paso), fuente, estado, estado_plan: estadoPlanDe(estado), cantidad_catalogo: evalCel(E, m.cantidad), nota: m.nota };
    });
    /* áreas propias: las que la persona agregó en este plan */
    if (ediciones) {
      const usados = Object.keys(nombresCat).map((k) => nombresCat[k]); let propias = 0;
      Object.keys(ediciones).filter((k) => ediciones[k] && ediciones[k].propia).sort().forEach((k) => {
        if (c.comps.some((m) => m.clave === k)) { avisa(k, 'La clave «' + k + '» ya es un área del catálogo: se ignoró el área propia.'); return; }
        if (propias >= AREAS.max_propias) { avisa(k, 'Hay más de ' + AREAS.max_propias + ' áreas propias: se ignoró «' + (ediciones[k].nombre || k) + '».'); return; }
        const v = validaAreaPropia(k, ediciones[k], usados);
        if (!v.ok) { avisa(k, 'El área propia «' + k + '» no es válida y no se contó: ' + v.mensaje); return; }
        if (v.ajuste) avisa(k, v.ajuste);
        if (v.degradado) avisa(k, v.degradado);
        const a = v.area; usados.push(a.nombre); propias++;
        let m2 = null, pct = null;
        if (a.unidad === 'm2') m2 = a.valor; else m2 = esNum(baseNodoV) ? a.valor * baseNodoV : null;
        if (esNum(m2) && esNum(baseNodoV) && baseNodoV > 0) pct = m2 / baseNodoV; else if (a.unidad === 'pct') pct = a.valor;
        res.push({ clave: k, nombre: a.nombre, nombre_catalogo: null, renombrada: false, propia: true, rol: a.rol, activo: true, cantidad: a.valor, unidad_base: a.unidad, unidad_catalogo: a.unidad, m2, pct, min: 0, max: a.unidad === 'm2' ? AREAS.m2_max : AREAS.pct_max, paso: a.unidad === 'm2' ? 1 : 0.005, fuente: a.fuente || 'Dato de este plan', estado: a.estado === 'referencia' ? 'referencia' : a.estado === 'confirmado' ? 'confirmado' : 'editado', estado_plan: a.estado, cantidad_catalogo: null, nota: 'Área agregada en este plan (' + (a.rol === 'vendible' ? 'se vende, al mismo precio por m² que la vivienda' : 'no se vende: reduce lo vendible') + ').' });
      });
    }
    return res;
  }

  /* ── una pasada en orden topológico ── */
  function pasada(E, G) {
    const D = E.D, plan = E.plan, valores = plan.valores || {};
    E.reinicia();
    const datos = plan.datos || {};
    for (let i = 0; i < D.N; i++) if (D.kind[i] === 'dato') {
      const x = datos[D.ids[i]]; const v = x && typeof x === 'object' && 'valor' in x ? x.valor : x;
      if (v !== undefined && v !== null && !(typeof v === 'number' && !isFinite(v))) { E.v[i] = v; E.est[i] = 'confirmado'; }
    }
    for (let q = 0; q < D.orden.length; q++) {
      const i = D.orden[q], k = D.kind[i];
      if (k === 'dato') continue;
      if (k === 'virtual') { calculaVirtual(E, i); continue; }
      const c = D.cn[i];
      /* elegibilidad estructural: el padre está a la vista y tiene valor; la condición `aparece` es verdadera */
      if (!c.raiz) {
        const p = D.ix.get(c.de);
        if (p === undefined || !E.vis[p] || E.v[p] === null) continue;
      }
      if (c.fAparece && c.fAparece(E) !== true) continue;
      if (c.tipo === 'calculado') {
        const x = c.fFormula ? c.fFormula(E) : null;
        if (x === null || x === undefined) continue;
        E.v[i] = x; E.vis[i] = 1;
        let f = true; const ds = D.firmDeps[i]; for (let t = 0; t < ds.length; t++) if (!E.firm[ds[t]]) { f = false; break; }
        E.firm[i] = f;
        continue;
      }
      procesaCaptura(E, c, i, valores[c.id] || null, G);
    }
  }

  function calculaVirtual(E, i) {
    const D = E.D, tid = D.ids[i], e = D.escribeDe.get(tid), wi = D.ix.get(e.writer);
    if (!E.vis[wi] || E.v[wi] === null) return;
    const lista = e.por[E.opc[wi]]; if (!lista) return;
    const w = lista.find((q) => q.tid === tid); if (!w || !w.f) return;
    const x = w.f(E); if (x === null || x === undefined) return;
    E.v[i] = x; E.est[i] = E.est[wi]; E.vis[i] = 1;
    let f = true; const ds = D.firmDeps[i]; for (let t = 0; t < ds.length; t++) if (!E.firm[ds[t]]) { f = false; break; }
    E.firm[i] = f;
  }

  /* M1 (ola 5): una referencia que sale de una expresión se AJUSTA al rango del nodo; el motor no la deja salirse de él y avisa. */
  function ajustaARango(x, mn, mx) {
    if (!esNum(x)) return { v: x, lado: null };
    if (mn !== null && mn !== undefined && x < mn - 1e-9 * Math.max(1, Math.abs(mn))) return { v: mn, lado: 'minimo' };
    if (mx !== null && mx !== undefined && x > mx + 1e-9 * Math.max(1, Math.abs(mx))) return { v: mx, lado: 'maximo' };
    return { v: x, lado: null };
  }
  function textoAjuste(E, c, aj) {
    const prec = (x) => (c.unidad.clase === 'u_mes' || c.unidad.clase === 'n') && esNum(x) ? String(Math.round(x * 100) / 100) + sufijo(c) : fmtF(E, c, x);   // las tasas chicas llevan dos decimales (0.16, no 0.2)
    const lado = aj.lado === 'minimo' ? 'mínimo' : 'máximo';
    return 'La referencia se ajustó al ' + lado + ' (' + prec(aj.a) + '): con este tamaño el cálculo daba ' + prec(aj.de) + ' y el rango de ' + c.titulo + ' va de ' + prec(E.mn[c.i]) + ' a ' + prec(E.mx[c.i]) + '.';
  }

  function procesaCaptura(E, c, i, reg, G) {
    /* efectos vigentes */
    let ovRef = null, ovRango = null; const ovOp = {}; let notas = null;
    for (const ef of c.efectos) {
      if (ef.soloNota || ef.fCuando(E) !== true) continue;
      for (const h of ef.haz) {
        if (h.k === 'nota') (notas = notas || []).push(h.texto);
        else if (h.k === 'ref') ovRef = h;
        else if (h.k === 'rango') ovRango = h;
        else if (h.k === 'valor_opcion') ovOp[h.clave] = h.f;
      }
    }
    if (notas) E.notas[i] = notas;
    /* rango en unidades del factor */
    const rg = c.rango, sc = (cel) => { const x = evalCel(E, cel); return esNum(x) ? defAFactor(E, c, x) : null; };
    let mn = rg ? sc(rg.min) : null, mx = rg ? sc(rg.max) : null, pa = rg ? sc(rg.paso) : null;
    if (ovRango) {
      const g = (f) => { if (!f) return undefined; const x = f(E); return esNum(x) ? defAFactor(E, c, x) : undefined; };
      const a = g(ovRango.fmin), b = g(ovRango.fmax), p2 = g(ovRango.fpaso);
      if (a !== undefined) mn = a; if (b !== undefined) mx = b; if (p2 !== undefined) pa = p2;
    }
    const ajs = {};   // ajustes a rango por origen (clave de la fuente o '@ref')
    const ajusta = (x, clave) => {
      if (c.compuesto || !esNum(x)) return x;
      const r = ajustaARango(x, mn, mx); if (r.lado) ajs[clave] = { lado: r.lado, de: x, a: r.v };
      return r.v;
    };
    const valorOp = (o) => {
      if (ovOp[o.clave]) { const x = ovOp[o.clave](E); return esNum(x) || typeof x === 'string' ? ajusta(defAFactor(E, c, x), o.clave) : null; }
      const x = evalCel(E, o.valor); return x === null ? null : ajusta(defAFactor(E, c, x), o.clave);
    };
    let refVal = null; const refOpc = c.referencia ? c.referencia.opcion : null;
    const exRef = () => (ovRef ? (ovRef.ex.base ? evalCel(E, ovRef.ex) : (ovRef.f ? ovRef.f(E) : null)) : null);
    if (c.compuesto) refVal = null;
    else if (refOpc) { const o = c.opciones.find((q) => q.clave === refOpc); refVal = o ? valorOp(o) : null; }
    else if (ovRef) { const x = exRef(); refVal = x === null ? null : ajusta(defAFactor(E, c, x), '@ref'); }
    else if (c.referencia && c.referencia.valor) { const x = evalCel(E, c.referencia.valor); refVal = x === null ? null : ajusta(defAFactor(E, c, x), '@ref'); }
    const fuera = (x) => esNum(x) && ((mn !== null && x < mn - 1e-9 * Math.max(1, Math.abs(mn))) || (mx !== null && x > mx + 1e-9 * Math.max(1, Math.abs(mx))));
    const marcaReab = (motivo) => { E.reabiertas.push({ i, id: c.id, motivo }); E.motivo[i] = motivo; };
    let val = null, est = null, opc = null;
    const e0 = reg && reg.estado;

    if (c.compuesto) {
      const refKey = refOpc, ediciones = (E.plan.componentes || {})[c.id] || null;
      let key = null;
      if (e0 === 'decidido' || e0 === 'confirmado') {
        if (reg.opcion && reg.opcion !== 'personalizado') {
          if (c.opciones.some((o) => o.clave === reg.opcion)) { key = reg.opcion; est = 'decidido'; opc = reg.opcion; }
          else { key = refKey; est = 'reabierto'; opc = null; marcaReab('El preajuste «' + reg.opcion + '» ya no existe en la definición.'); }
        } else {
          const b = reg.base_opcion || refKey; key = c.opciones.some((o) => o.clave === b) ? b : refKey; est = 'decidido'; opc = 'personalizado';
        }
      } else if (e0 === 'no_se') { key = refKey; est = 'no_se'; opc = refKey; }
      else if (ediciones && Object.keys(ediciones).length) { key = refKey; est = 'decidido'; opc = 'personalizado'; }
      if (est !== null) {
        const edits = (opc === 'personalizado' || (est === 'decidido' && ediciones)) ? ediciones : null;
        E.v[i] = null; E.vis[i] = 1;
        E.comps[i] = construyeComps(E, c, key, edits, i);
        const x = c.fFormula ? c.fFormula(E) : null;
        val = x === undefined ? null : x;
        E.vis[i] = 0;
      }
    } else if (c.tipo === 'se_decide') {
      if (e0 === 'decidido' || e0 === 'confirmado') {
        const o = reg.opcion ? c.opciones.find((q) => q.clave === reg.opcion) : null;
        if (o) { val = valorOp(o); est = 'decidido'; opc = o.clave; }
        else if (!reg.opcion && c.permiteOtro && esNum(reg.valor)) {
          const f = planAFactor(E, c, reg.valor);
          if (f !== null && !fuera(f)) { val = f; est = 'decidido'; opc = null; }
          else { est = 'reabierto'; marcaReab('El valor escrito queda fuera del rango permitido.'); val = refVal; opc = refOpc; }
        } else {
          est = 'reabierto'; marcaReab(reg.opcion ? 'La opción «' + reg.opcion + '» ya no existe en la definición.' : 'La decisión guardada no trae opción ni valor válido.');
          val = refVal; opc = c.opciones.some((q) => q.clave === refOpc) ? refOpc : null;
        }
      } else if (e0 === 'no_se') { val = refVal; est = refVal === null ? null : 'no_se'; opc = refOpc; }
    } else {
      const defOp = c.fuentes ? (c.opciones.find((q) => q.porOmision) || c.opciones[0]) : null;
      if (e0 === 'decidido' && c.fuentes && !(reg && (reg.valor !== undefined && reg.valor !== null) && !reg.opcion)) {   // fuente elegida de la lista (un número escrito sigue otro camino)
        const o = reg.opcion ? c.opciones.find((q) => q.clave === reg.opcion) : null;
        if (o) { val = valorOp(o); est = 'decidido'; opc = o.clave; }
        else { est = 'reabierto'; marcaReab('La fuente «' + reg.opcion + '» ya no existe en la definición.'); val = refVal; opc = defOp ? defOp.clave : null; }
      } else if ((e0 === 'confirmado' || e0 === 'decidido') && reg && reg.valor !== undefined && reg.valor !== null) {
        const f = planAFactor(E, c, reg.valor);
        if (f !== null) { val = f; est = e0 === 'decidido' ? 'decidido' : 'confirmado'; opc = null; if (fuera(f)) E.fuera[i] = true; }
      } else if (e0 === 'no_se' && refVal !== null) { val = refVal; est = 'no_se'; opc = defOp ? defOp.clave : null; }
      if (est === null && refVal !== null) { val = refVal; est = 'referencia'; opc = defOp ? defOp.clave : null; }
    }
    E.rf[i] = refVal; E.mn[i] = mn; E.mx[i] = mx; E.pa[i] = pa;
    if (est !== null && !c.compuesto) {
      /* el aviso solo cuenta si el valor usado viene de la referencia o de una fuente de la lista, no de un número escrito por la persona */
      const clave = opc !== null ? opc : (est === 'referencia' || est === 'no_se' || est === 'reabierto' ? '@ref' : null);
      if (clave !== null && ajs[clave]) { E.refAj[i] = ajs[clave]; (E.notas[i] = E.notas[i] || []).push(textoAjuste(E, c, ajs[clave])); }
    }
    if (c.tipo === 'se_decide' && est === null) {
      /* decisión sin contestar: ocupa un cupo si lo tiene */
      if (G.has(i)) { E.vis[i] = 1; E.abiertas.push(i); } else { E.vis[i] = 0; E.esperan.push(i); }
      E.v[i] = null; E.comps[i] = null; return;
    }
    if (est === null) { E.vis[i] = 1; E.v[i] = null; return; }   // raíz sin captura
    E.v[i] = val === undefined ? null : val; E.est[i] = est; E.opc[i] = opc; E.vis[i] = 1;
    E.firm[i] = firmeE(est);
  }

  /* ── conducción: repite la pasada dando cupos a las decisiones en espera ── */
  function contextoDe(D, plan) {
    const cx = (plan && plan.contexto) || {};
    return { version: cx.version || D.L.versiones_plan[0], escenario: cx.escenario || 'base', tipo: (plan && plan.tipo) || D.tipo.id };
  }
  function normalizaPlan(plan) {
    const p = plan ? Object.assign({}, plan) : {};
    p.valores = p.valores || {}; p.componentes = p.componentes || {}; p.datos = p.datos || {}; p.aparcados = p.aparcados || {};
    return p;
  }
  function llaveOrden(D, i) { const c = D.cn[i]; return [c.prioridad === null ? 1e9 : c.prioridad, c.orden, i]; }
  const cmpLlave = (a, b) => { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k]; return 0; };

  function corre(D, plan) {
    plan = normalizaPlan(plan);
    const ctx = contextoDe(D, plan), E = new Entorno(D, plan, ctx);
    const cupoCel = elige(D.tipo.maxAbiertas, ctx), cupoV = cupoCel ? cupoCel(E_VACIO) : 3;
    E.cupo = esNum(cupoV) ? cupoV : 3;
    const G = new Set(); let vueltaFin = false;
    for (let vuelta = 0; vuelta < 30; vuelta++) {
      if (vuelta === 29) vueltaFin = true;
      pasada(E, G);
      const abiertos = E.abiertas.length + E.reabiertas.length;
      if (E.esperan.length && abiertos < E.cupo) {
        const mejor = E.esperan.slice().sort((a, b) => cmpLlave(llaveOrden(D, a), llaveOrden(D, b)))[0];
        G.add(mejor); continue;
      }
      if (abiertos > E.cupo && E.abiertas.length) {
        const peor = E.abiertas.slice().sort((a, b) => cmpLlave(llaveOrden(D, b), llaveOrden(D, a)))[0];
        G.delete(peor); continue;
      }
      break;
    }
    E.G = G;
    if (vueltaFin) E.sinConverger = true;
    /* efectos que solo agregan una nota: no cambian ningún valor, se leen al final (pueden mirar a un hijo) */
    for (let i = 0; i < D.cn.length; i++) {
      if (!E.vis[i]) continue;
      for (const ef of D.cn[i].efectos) if (ef.soloNota && ef.fCuando(E) === true) ef.haz.forEach((h) => { (E.notas[i] = E.notas[i] || []).push(h.texto); });
    }
    return E;
  }


  /* ═════════════════════════ ALERTAS, RUTA DE CAUSA, RESULTADO ═════════════════════════ */
  const cmpMeta = (m, t, op) => {
    if (!esNum(m) || !esNum(t)) return null;
    const tol = 1e-9 * Math.max(1, Math.abs(t));
    return op === '>=' ? m >= t - tol : op === '>' ? m > t + tol : op === '<=' ? m <= t + tol : m < t - tol;
  };
  function textoAlerta(E, al) {
    return al.partes.map((p) => {
      if (p.lit !== undefined) return p.lit;
      const j = E.D.ix.get(p.id); if (j === undefined) return '{' + p.id + '}';
      const c = E.D.cn[j];
      if (p.campo === 'valor') return fmtF(E, c, E.v[j]);
      if (p.campo === 'estado') return E.est[j] || '—';
      if (p.campo === 'opcion') return E.opc[j] || '—';
      return fmtF(E, c, p.campo === 'ref' ? E.rf[j] : p.campo === 'min' ? E.mn[j] : E.mx[j]);
    }).join('');
  }
  /* Evalúa las alertas de los nodos visibles. Devuelve la lista de las ACTIVAS con su medida. */
  function evaluaAlertas(E, soloIds) {
    const D = E.D, ctx = E.ctx, out = [];
    for (let i = 0; i < D.cn.length; i++) {
      const c = D.cn[i]; if (!E.vis[i]) continue;
      for (const al of c.alertas) {
        if (soloIds && !soloIds.has(al.id)) continue;
        let m = null, t = null, pasa = null, dist = null;
        if (al.fMedida && al.meta) {
          m = al.fMedida(E); const ft = elige(al.meta, ctx); t = ft ? ft(E) : null; pasa = cmpMeta(m, t, al.pasaSi);
          if (pasa === false) dist = Math.abs(t) > 1e-12 ? Math.abs(m - t) / Math.abs(t) : Math.abs(m - t); else if (pasa === true) dist = 0;
        }
        const activa = al.fCuando ? al.fCuando(E) === true : pasa === false;
        if (activa || soloIds) out.push({ al, c, activa, medida: m, meta: t, pasa, distancia: dist, builtin: false });
      }
      /* alertas que el motor genera por sí solo (D7 14.2, 6.4) */
      {
        if (c.fuentes && E.fuentesDifieren(i)) {
          const vs = c.opciones.map((o) => { const x = elige(o.valor, ctx)(E); return fmtF(E, c, esNum(x) ? ajustaARango(defAFactor(E, c, x), E.mn[i], E.mx[i]).v : x); });
          out.push({ al: { id: 'AL-FUENTES-' + c.id, nivel: 'info', owner: i, sobre: [c.id], palancas: null, sugiereF: false, partes: [{ lit: 'Hay ' + c.opciones.length + ' fuentes que no coinciden (' + vs.join(' y ') + '): elige una.' }], medida: null, fMedida: null, meta: null }, c, activa: true, medida: null, meta: null, pasa: null, distancia: null, builtin: true });
        }
        if (E.refAj[i]) {
          out.push({ al: { id: 'AL-REFAJUSTE-' + c.id, nivel: 'aviso', owner: i, sobre: [c.id], palancas: [c.id], sugiereF: false, partes: [{ lit: textoAjuste(E, c, E.refAj[i]) }], medida: null, fMedida: null, meta: null }, c, activa: true, medida: null, meta: null, pasa: null, distancia: null, builtin: true });
        }
        (E.avisosAreas || []).filter((x) => x.i === i).forEach((x) => out.push({ al: { id: 'AL-AREA-' + x.clave, nivel: 'aviso', owner: i, sobre: [c.id], palancas: [c.id], sugiereF: false, partes: [{ lit: x.texto }], medida: null, fMedida: null, meta: null }, c, activa: true, medida: null, meta: null, pasa: null, distancia: null, builtin: true }));
        if (E.fuera[i]) {
          out.push({ al: { id: 'AL-RANGO-' + c.id, nivel: 'aviso', owner: i, sobre: [c.id], palancas: [c.id], sugiereF: false, partes: [{ lit: 'El valor de ' + c.titulo + ' (' + fmtF(E, c, E.v[i]) + ') queda fuera del rango ' + fmtF(E, c, E.mn[i]) + ' a ' + fmtF(E, c, E.mx[i]) + '.' }], medida: null, fMedida: null, meta: null }, c, activa: true, medida: null, meta: null, pasa: null, distancia: null, builtin: true });
        }
      }
    }
    return out;
  }

  const TIPOS_ARISTA = ['formula', 'flujo', 'escribe', 'componente', 'condicion', 'efecto', 'usa'];
  function tipoArista(D, a, b) {
    let mejor = null;
    D.deps[b].forEach((d) => { if (d.j === a && d.tipo !== 'de') { if (mejor === null || TIPOS_ARISTA.indexOf(d.tipo) < TIPOS_ARISTA.indexOf(mejor)) mejor = d.tipo; } });
    return mejor || 'condicion';
  }
  const igualV = (a, b) => (esNum(a) && esNum(b) ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);
  function cambiados(D, E0, E1) {
    const set = new Set();
    for (let i = 0; i < D.N; i++) { if (D.kind[i] === 'dato') continue; const a = E0.vis[i] ? E0.v[i] : null, b = E1.vis[i] ? E1.v[i] : null; if (!igualV(a, b) || (E0.vis[i] !== E1.vis[i])) set.add(i); }
    return set;
  }
  /* Camino más corto de `fuentes` a `y` por aristas de cálculo, con desempates deterministas (D7 15.3, caso A). */
  function caminoCorto(D, fuentes, y, permitidos, E0, E1, extra) {
    const rel = (v) => { const a = E0 ? E0.v[v] : null, b = E1 ? E1.v[v] : null; if (esNum(a) && esNum(b)) return Math.abs(a) > 1e-12 ? Math.abs((b - a) / a) : 1; return igualV(a, b) ? 0 : 1; };
    const mejor = (a, b) => (a.score > b.score + 1e-12) || (Math.abs(a.score - b.score) <= 1e-12 && a.seq < b.seq);
    const vistos = new Set(); let capa = new Map();
    fuentes.forEach((o) => { if (!capa.has(o)) capa.set(o, { path: [o], score: 0, seq: D.ids[o] }); vistos.add(o); });
    if (vistos.has(y) && fuentes.length === 1 && fuentes[0] === y) return [y];
    while (capa.size) {
      if (capa.has(y)) return capa.get(y).path;
      const sig = new Map();
      Array.from(capa.keys()).sort((a, b) => (D.ids[a] < D.ids[b] ? -1 : 1)).forEach((u) => {
        const cu = capa.get(u);
        (D.sal[u] || []).concat((extra && extra.get(u)) || []).forEach((e) => {
          const v = e.a; if (vistos.has(v)) return; if (permitidos && !permitidos.has(v)) return;
          const cand = { path: cu.path.concat(v), score: cu.score + rel(v), seq: cu.path.concat(v).map((q) => D.ids[q]).join('>') };
          if (!sig.has(v) || mejor(cand, sig.get(v))) sig.set(v, cand);
        });
      });
      sig.forEach((_, v) => vistos.add(v)); capa = sig;
    }
    return null;
  }
  function ancestrosDe(D, semillas) {
    const vis = new Set(semillas), pila = semillas.slice();
    while (pila.length) { const u = pila.pop(); D.deps[u].forEach((d) => { if (d.tipo !== 'de' && !vis.has(d.j)) { vis.add(d.j); pila.push(d.j); } }); }
    return vis;
  }
  /* la condición de una alerta lee valores: cuentan como aristas hacia el dueño para trazar la ruta (D7 15.3) */
  function aristasDeAlerta(D, al) {
    const m = new Map();
    idsDeAlerta(D, al).forEach((j) => { if (j === al.owner || D.kind[j] === 'dato') return; if (!m.has(j)) m.set(j, [{ a: al.owner, tipo: 'condicion' }]); });
    return m;
  }
  function idsDeAlerta(D, al) {
    const out = [al.owner];
    const juntar = (x) => { if (x) x.an.ids.forEach((id) => { const j = D.ix.get(id); if (j !== undefined) out.push(j); }); };
    juntar(al.cuando); juntar(al.medida);
    if (al.meta) [al.meta.base].concat(al.meta.vars).forEach((v) => v.an.ids.forEach((id) => { const j = D.ix.get(id); if (j !== undefined) out.push(j); }));
    return out;
  }

  /* ── cambios de la persona (B.1) ── */
  function baseDePlan(plan) { return { valores: Object.assign({}, plan.valores), componentes: Object.assign({}, plan.componentes) }; }
  function aplicaCambio(D, E0, plan, cambio, errores, nuevos) {   // `nuevos` (solo compara): lista donde se anotan los datos que el plan de partida todavía no tenía a la vista (M6)
    const valores = Object.assign({}, plan.valores || {}), componentes = Object.assign({}, plan.componentes || {});
    let contexto = plan.contexto ? Object.assign({}, plan.contexto) : undefined;
    Object.keys(cambio || {}).forEach((id) => {
      const ch = cambio[id] || {};
      if (id === '@contexto') { contexto = Object.assign({}, contexto || {}, ch); return; }
      const idx = D.ix.get(id);
      if (idx === undefined || D.kind[idx] !== 'nodo') { errores.push({ codigo: 'id_desconocido', id, mensaje: 'No existe el nodo ' + id + '.' }); return; }
      const c = D.cn[idx];
      if (c.tipo === 'calculado') { errores.push({ codigo: 'id_desconocido', id, mensaje: id + ' es un resultado calculado: no se captura ni se compara.' }); return; }
      if (E0 && !E0.vis[idx] && ch.estado !== 'referencia') { if (nuevos) { if (nuevos.indexOf(id) < 0) nuevos.push(id); } else { errores.push({ codigo: 'nodo_no_visible', id, mensaje: id + ' todavía no está a la vista.' }); return; } }
      if (ch.estado === 'referencia') { delete valores[id]; delete componentes[id]; return; }
      if (ch.estado === 'no_se') {
        if (!c.referencia || (!c.referencia.opcion && !c.referencia.valor)) { errores.push({ codigo: 'opcion_no_disponible', id, mensaje: 'Este dato no tiene referencia: no admite «no sé todavía».' }); return; }
        valores[id] = { estado: 'no_se' }; delete componentes[id]; return;
      }
      const vistaLim = () => (E0 ? [factorAVista(E0, c, E0.mn[idx]), factorAVista(E0, c, E0.mx[idx])] : [null, null]);
      if (c.compuesto) {
        let base = (valores[id] && (valores[id].opcion !== 'personalizado' ? valores[id].opcion : valores[id].base_opcion)) || (c.referencia && c.referencia.opcion);
        if (ch.opcion) {
          if (!c.opciones.some((o) => o.clave === ch.opcion)) { errores.push({ codigo: 'opcion_no_disponible', id, mensaje: 'El preajuste «' + ch.opcion + '» no existe o no está disponible.' }); return; }
          valores[id] = { estado: 'decidido', opcion: ch.opcion }; base = ch.opcion;
          /* un preajuste prende y apaga los componentes del catálogo, pero no borra lo que la persona agregó ni los nombres que puso (ola 6) */
          const previo = componentes[id] || {}, conserva = {};
          Object.keys(previo).forEach((k) => { const x = previo[k]; if (x && x.propia) conserva[k] = x; else if (x && typeof x.nombre === 'string' && x.nombre.trim() !== '') conserva[k] = { nombre: x.nombre }; });
          if (Object.keys(conserva).length) componentes[id] = conserva; else delete componentes[id];
        }
        if (ch.componentes) {
          const ed = Object.assign({}, componentes[id] || {});
          Object.keys(ch.componentes).forEach((k) => {
            const m = c.comps.find((q) => q.clave === k);
            const pedido = ch.componentes[k] || {};
            /* nombres que ya existen en este edificio (menos el del área que se está tocando): el del catálogo (o su renombre) y los de las propias */
            const usadosSin = (sin) => c.comps.filter((q) => q.clave !== sin).map((q) => { const x = ed[q.clave]; return x && typeof x.nombre === 'string' && validaNombreArea(x.nombre, []).ok ? x.nombre : q.nombre; })
              .concat(Object.keys(ed).filter((q) => q !== sin && ed[q] && ed[q].propia).map((q) => ed[q].nombre));
            if (!m) {   // un área propia: se agrega, se cambia o se quita
              const actual = ed[k];
              if (pedido.quitar === true) { if (actual && actual.propia) delete ed[k]; else errores.push({ codigo: 'componente_desconocido', id, mensaje: 'No hay un área propia «' + k + '» que quitar en ' + id + '.' }); return; }
              if (!(pedido.propia === true || (actual && actual.propia))) { errores.push({ codigo: 'componente_desconocido', id, mensaje: 'El componente «' + k + '» no existe en ' + id + ' (para agregar un área nueva marca propia: true).' }); return; }
              if (!actual && Object.keys(ed).filter((q) => ed[q] && ed[q].propia).length >= AREAS.max_propias) { errores.push({ codigo: 'area_limite', id, mensaje: 'Ya hay ' + AREAS.max_propias + ' áreas propias en ' + id + ': quita una para agregar otra.' }); return; }
              const e = Object.assign({}, actual || {}, pedido); delete e.quitar; e.propia = true;
              const v = validaAreaPropia(k, e, usadosSin(k));
              if (!v.ok) { errores.push({ codigo: v.codigo, id, mensaje: v.mensaje }); return; }
              if (v.ajuste) errores.push({ codigo: 'fuera_de_rango_componente', id, mensaje: v.ajuste });
              if (v.degradado) errores.push({ codigo: 'fuente_no_disponible', id, mensaje: v.degradado });
              ed[k] = v.area; return;
            }
            if (pedido.quitar === true) pedido.activo = false;
            if (pedido.estado === 'referencia') { const sin = ed[k] && typeof ed[k].nombre === 'string' ? { nombre: ed[k].nombre } : null; if (sin) ed[k] = sin; else delete ed[k]; if (pedido.nombre === undefined) return; }
            const e = Object.assign({}, ed[k] || {}, pedido); delete e.quitar; delete e.propia;
            if (e.estado === 'referencia') delete e.estado;
            if (pedido.nombre !== undefined) {
              if (pedido.nombre === null || (typeof pedido.nombre === 'string' && pedido.nombre.trim() === '')) delete e.nombre;
              else {
                const v = validaNombreArea(pedido.nombre, usadosSin(k));
                if (v.ok) e.nombre = v.nombre;
                else { errores.push({ codigo: v.codigo, id, mensaje: v.mensaje }); if (ed[k] && typeof ed[k].nombre === 'string') e.nombre = ed[k].nombre; else delete e.nombre; }
              }
            }
            if (e.valor !== undefined && e.valor !== null && esNum(e.valor)) {
              const unidad = e.unidad || m.unidad;
              const lo = evalCel(E0 || { ctx: contextoDe(D, plan), v: [], D }, m.min), hi = evalCel(E0 || { ctx: contextoDe(D, plan), v: [], D }, m.max);
              let a = lo, b = hi;
              if (unidad !== m.unidad && E0) {
                const nb = (c.comps.find((x) => x.base) || {}).base, bi = (m.base || nb) ? D.ix.get(m.base || nb) : undefined, bv = bi === undefined ? null : E0.v[bi];
                const aM2 = (x) => (m.unidad === 'pct' ? x * bv : m.unidad === 'n' ? x * m.m2u : x);
                const dM2 = (x) => (unidad === 'pct' ? x / bv : unidad === 'n' ? x / (m.m2u || 1) : x);
                if (esNum(bv) && bv > 0) { a = esNum(lo) ? dM2(aM2(lo)) : lo; b = esNum(hi) ? dM2(aM2(hi)) : hi; }
              }
              if (esNum(a) && e.valor < a) { errores.push({ codigo: 'fuera_de_rango_componente', id, mensaje: 'El valor de «' + m.nombre + '» se ajustó al mínimo (' + a + ').' }); e.valor = a; }
              else if (esNum(b) && e.valor > b) { errores.push({ codigo: 'fuera_de_rango_componente', id, mensaje: 'El valor de «' + m.nombre + '» se ajustó al máximo (' + b + ').' }); e.valor = b; }
              e.unidad = unidad;
            }
            if (e.activo === false && esNum(evalCel(E0 || { ctx: contextoDe(D, plan), v: [], D }, m.min)) && evalCel(E0 || { ctx: contextoDe(D, plan), v: [], D }, m.min) > 0) {
              errores.push({ codigo: 'fuera_de_rango_componente', id, mensaje: '«' + m.nombre + '» no se puede quitar: su mínimo es mayor que 0.' }); delete e.activo;
            }
            const toca = e.activo !== undefined || e.valor !== undefined || e.estado !== undefined || e.fuente !== undefined;
            if (toca && e.estado === 'confirmado' && !(typeof e.fuente === 'string' && e.fuente.trim() !== '')) { errores.push({ codigo: 'fuente_no_disponible', id, mensaje: 'Para confirmar «' + m.nombre + '» hay que decir de dónde sale el dato; se guardó como decidido.' }); e.estado = 'editado'; }
            if (toca) e.estado = e.estado === 'confirmado' ? 'confirmado' : 'editado';
            if (Object.keys(e).length) ed[k] = e; else delete ed[k];
          });
          componentes[id] = ed; valores[id] = { estado: 'decidido', opcion: 'personalizado', base_opcion: base };
        }
        if (!ch.opcion && !ch.componentes) errores.push({ codigo: 'opcion_no_disponible', id, mensaje: 'Para ' + id + ' indique un preajuste (opcion) o componentes.' });
        return;
      }
      if (ch.opcion !== undefined && ch.opcion !== null) {
        if (!c.opciones.some((o) => o.clave === ch.opcion)) { errores.push({ codigo: c.fuentes ? 'fuente_no_disponible' : 'opcion_no_disponible', id, mensaje: 'La ' + (c.fuentes ? 'fuente' : 'opción') + ' «' + ch.opcion + '» no existe o no está disponible.' }); return; }
        valores[id] = { estado: 'decidido', opcion: ch.opcion, fuente: ch.fuente }; return;
      }
      if (ch.valor !== undefined && ch.valor !== null) {
        if (c.tipo === 'se_decide' && !c.permiteOtro) { errores.push({ codigo: 'opcion_no_disponible', id, mensaje: id + ' solo admite sus opciones, no otro valor.' }); return; }
        let v = ch.valor;
        const cl = c.unidad.clase, esNumerico = cl !== 'texto' && cl !== 'si_no' && !(c.lista && c.lista.length);
        if (esNumerico) {
          if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) v = Number(v);   // «57500» se acepta como número
          if (typeof v !== 'number' || !isFinite(v)) { errores.push({ codigo: 'fuera_de_rango', id, mensaje: 'Escribe un número.' }); return; }   // el valor anterior se queda
        }
        if (typeof v === 'number') {
          const [lo, hi] = vistaLim();
          if ((esNum(lo) && v < lo) || (esNum(hi) && v > hi)) { const aj = Math.min(esNum(hi) ? hi : v, Math.max(esNum(lo) ? lo : v, v)); errores.push({ codigo: 'fuera_de_rango', id, mensaje: 'Se ajustó al límite más cercano (' + aj + ').' }); v = aj; }
        }
        /* estado del valor escrito (D7 2.2): solo una fuente nombrada lo vuelve «confirmado» */
        const reg = { valor: v, fuente: ch.fuente };
        if (c.tipo === 'se_decide') reg.estado = 'decidido';
        else if (ch.estado === 'confirmado') {
          if (typeof ch.fuente === 'string' && ch.fuente.trim() !== '') reg.estado = 'confirmado';
          else { reg.estado = 'decidido'; reg.marca = 'valor_propio'; errores.push({ codigo: 'fuente_no_disponible', id, mensaje: 'Para confirmar ' + id + ' hay que decir de dónde sale el dato; se guardó como decidido (valor propio).' }); }
        } else if (ch.estado === 'decidido') { reg.estado = 'decidido'; reg.marca = ch.marca === 'sugerido' ? 'sugerido' : 'valor_propio'; }
        else reg.estado = 'confirmado';   // sin estado: conducta de antes
        valores[id] = reg; return;
      }
      errores.push({ codigo: 'opcion_no_disponible', id, mensaje: 'El cambio de ' + id + ' no trae opción ni valor.' });
    });
    const p2 = Object.assign({}, plan, { valores, componentes });
    if (contexto) p2.contexto = contexto;
    return p2;
  }

  /* Plan que debe guardar la pantalla: lo oculto pasa a «aparcados» (D7 6.5). */
  function planResultante(D, E, plan2) {
    const valores = {}, aparcados = Object.assign({}, plan2.aparcados || {});
    Object.keys(plan2.valores || {}).forEach((id) => {
      const idx = D.ix.get(id), reg = plan2.valores[id];
      if (idx !== undefined && D.kind[idx] === 'nodo' && E.vis[idx]) { valores[id] = reg; if (E.est[idx] === 'reabierto') aparcados[id] = { valor: reg.valor, estado: reg.estado, opcion: reg.opcion, razon: E.motivo[idx] || 'Dejó de ser válida.', revision: ((aparcados[id] && aparcados[id].revision) || 0) + 1 }; }
      else if (idx !== undefined && D.kind[idx] === 'nodo' && !D.cn[idx].compuesto && E.esperan.indexOf(idx) >= 0) valores[id] = reg;   // decisión en espera
      else aparcados[id] = { valor: reg.valor, estado: reg.estado, opcion: reg.opcion, razon: 'Su rama dejó de estar a la vista.', revision: ((aparcados[id] && aparcados[id].revision) || 0) + 1 };
    });
    const comp = {}; Object.keys(plan2.componentes || {}).forEach((id) => { if (valores[id]) comp[id] = plan2.componentes[id]; });
    const out = { tipo: plan2.tipo || D.tipo.id, contexto: plan2.contexto ? Object.assign({}, plan2.contexto) : undefined, valores, componentes: comp, aparcados, datos: plan2.datos || {} };
    if (plan2.reparto !== undefined) out.reparto = clonar(plan2.reparto);   // registro del reparto (T-10): sólo si el plan lo trae
    return out;
  }

  /* ── armado del Resultado ── */
  const vistaDe = (E, c, f) => factorAVista(E, c, f);
  function dibujoPadre(D, c) {   // el padre más cercano que se dibuja (los ocultos no tienen bolita)
    let p = c.de; let n = 0;
    while (p && n++ < 100) { const j = D.ix.get(p); if (j === undefined) return null; if (!D.cn[j].oculto) return p; p = D.cn[j].de; }
    return null;
  }
  function fuentesInfo(E, c) {
    const i = c.i;
    return c.opciones.map((o) => {
      const x = evalCel(E, o.valor); let f = x === null ? null : defAFactor(E, c, x); const aj = ajustaARango(f, E.mn[i], E.mx[i]); f = aj.v;
      return { clave: o.clave, nombre: o.nombre, valor: f === null ? null : vistaDe(E, c, f), ajustada: aj.lado, fuente: o.fuente, fecha_fuente: o.fecha_fuente, por_omision: !!o.porOmision, elegida: E.est[i] === 'decidido' && E.opc[i] === o.clave };
    });
  }
  function opcionesInfo(E, c) {
    const i = c.i;
    return c.opciones.map((o) => {
      let valor = null;
      if (!c.compuesto) { const x = evalCel(E, o.valor); if (x !== null) valor = esNum(x) ? vistaDe(E, c, defAFactor(E, c, x)) : x; }
      return { clave: o.clave, nombre: o.nombre, implica: o.implica, valor, disponible: true, motivo: null };
    });
  }
  function depsDirectas(D, i) {
    const out = [];
    D.deps[i].forEach((d) => { if (['formula', 'flujo', 'escribe', 'componente'].indexOf(d.tipo) < 0) return; let j = d.j; if (D.kind[j] === 'virtual') { j = D.ix.get(D.escribeDe.get(D.ids[j]).writer); } if (j !== i && out.indexOf(j) < 0) out.push(j); });
    return out;
  }
  function nodoOut(E, Ea, c) {
    const D = E.D, i = c.i;
    const vf = E.v[i];
    const o = {
      id: c.id, tipo: c.tipo, titulo: c.titulo, de: dibujoPadre(D, c), de_original: c.de, usa: [], raiz: c.raiz, tarjetas: c.tarjetas,
      pregunta: c.pregunta, que_es: c.que_es, etiqueta_resultado: c.etiqueta_resultado, permite_otro: c.permiteOtro,
      estado: c.tipo === 'calculado' ? null : (E.est[i] || null), opcion: E.opc[i] || null,
      valor: vf === undefined ? null : vf, valor_vista: vf === null || vf === undefined ? null : vistaDe(E, c, vf), unidad: c.escala ? { clase: c.unidad.clase, etiqueta: c.unidad.etiqueta, escala: c.escala } : { clase: c.unidad.clase, etiqueta: c.unidad.etiqueta },
      opciones: [], fuentes: [], componentes: [], referencia: null, rango: null, ajuste_referencia: E.refAj[i] ? { lado: E.refAj[i].lado, calculada: vistaDe(E, c, E.refAj[i].de), usada: vistaDe(E, c, E.refAj[i].a) } : null, notas: E.notas[i] || [], origen: null, confirma_en: c.confirma_en,
      de_que_sale: null, heredado: null, marca: null, antes: null, oculto: c.oculto, sentido: c.sentido
    };
    const usa = c.usa.slice(); depsDirectas(D, i).forEach((j) => { const id = D.ids[j]; if (c.tipo === 'calculado' && usa.indexOf(id) < 0) usa.push(id); }); o.usa = usa.filter((x) => x !== c.id);
    if (c.tipo === 'se_decide' && !c.fuentes) o.opciones = opcionesInfo(E, c);
    if (c.fuentes) o.fuentes = fuentesInfo(E, c);
    if (c.compuesto) {
      o.componentes = (E.comps[i] || construyeComps(E, c, c.referencia && c.referencia.opcion, null, i)).map((m) => ({ clave: m.clave, nombre: m.nombre, nombre_catalogo: m.nombre_catalogo, renombrada: m.renombrada, propia: m.propia, rol: m.rol, vende: m.rol === 'vendible', activo: m.activo, cantidad: m.cantidad, unidad_base: m.unidad_base, m2: m.m2, pct: m.pct, min: m.min, max: m.max, paso: m.paso, fuente: m.fuente, estado: m.estado, estado_plan: m.estado_plan }));
      o.areas = { max_propias: AREAS.max_propias, propias: o.componentes.filter((m) => m.propia).length, nombre_max: AREAS.nombre_max, nombre_min: AREAS.nombre_min, fuente_max: AREAS.fuente_max, m2_max: AREAS.m2_max, pct_max: AREAS.pct_max, roles: AREAS.roles.slice(), unidades: AREAS.unidades.slice(), estados: AREAS.estados.slice(), clave_nueva: nuevaClaveArea(((E.plan && E.plan.componentes) || {})[c.id]) };
    }
    if (c.tipo !== 'calculado') {
      const rf = E.rf[i];
      o.referencia = { valor: rf === null || rf === undefined ? null : vistaDe(E, c, rf), origen: c.referencia ? c.referencia.origen : null, opcion: c.referencia ? c.referencia.opcion : null };
      if (c.rango) o.rango = { min: E.mn[i] === null ? null : vistaDe(E, c, E.mn[i]), max: E.mx[i] === null ? null : vistaDe(E, c, E.mx[i]), paso: E.pa[i] === null ? null : vistaDe(E, c, E.pa[i]) };
      o.origen = c.referencia ? c.referencia.origen : null;
      o.de_que_sale = { texto: o.origen, ids: [] };
    } else {
      const ds = depsDirectas(D, i); const tit = ds.map((j) => D.cn[j] && D.cn[j].titulo).filter(Boolean);
      o.de_que_sale = { texto: tit.length ? 'Se calcula con ' + tit.slice(0, 8).join(', ') + (tit.length > 8 ? ' y otros' : '') + '.' : c.que_es, ids: ds.map((j) => D.ids[j]).slice(0, 12) };
      o.heredado = E.firm[i] ? 'firme' : 'estimado';
    }
    if (c.compuesto && E.est[i] === 'decidido' && E.opc[i] === 'personalizado') { const pl = (E.plan.valores || {})[c.id]; o.opcion_base = pl && pl.base_opcion || (c.referencia && c.referencia.opcion) || null; }
    if (E.est[i] === 'reabierto') o.motivo = E.motivo[i];
    if (Ea) {
      if (!Ea.vis[i]) o.marca = 'nuevo';
      else if (!igualV(Ea.vis[i] ? Ea.v[i] : null, vf)) { o.marca = 'cambio'; o.antes = Ea.v[i] === undefined ? null : Ea.v[i]; }
    }
    return o;
  }

  function armaTarjetas(E) {
    const D = E.D, out = {};
    const tiene = (id) => { const j = D.ix.get(id); return j !== undefined && E.vis[j] === 1 && E.v[j] !== null && E.v[j] !== undefined; };
    TARJETAS.forEach((t) => {
      const facs = D.factores.filter((f) => f.tarjetas.indexOf(t) >= 0);
      const minimos = facs.filter((f) => f.minimo);
      const encendida = t === 'Riesgo y estado' ? true : (minimos.length > 0 && minimos.every((f) => tiene(f.id)));
      const cifras = facs.filter((f) => f.ordenTarjeta !== null).sort((a, b) => a.ordenTarjeta - b.ordenTarjeta || (a.id < b.id ? -1 : 1)).map((f) => {
        const j = D.ix.get(f.id), c = j !== undefined ? D.cn[j] : null, vis = tiene(f.id), v = vis ? E.v[j] : null;
        let vv = v;
        if (esNum(v) && f.conversion === '/1000000') vv = v / 1e6;
        const firme = !vis ? false : (c && c.tipo === 'calculado' ? E.firm[j] : (firmeE(E.est[j]) && !valorPropio(E, c)));
        return { clave: f.id, etiqueta: f.etiqueta || f.nombre, id: f.id, valor: v, valor_visor: vv, unidad: c ? (c.escala ? { clase: c.unidad.clase, etiqueta: c.unidad.etiqueta, escala: c.escala } : { clase: c.unidad.clase, etiqueta: c.unidad.etiqueta }) : null, estado: firme ? 'firme' : 'estimado', campo_visor: f.campoVisor };
      });
      if (t === 'Riesgo y estado' && D.ix.has('RV-10') && !cifras.some((q) => q.id === 'RV-10')) {
        const j = D.ix.get('RV-10'), vis = tiene('RV-10');
        cifras.push({ clave: 'RV-10', etiqueta: 'Pruebas', id: 'RV-10', valor: vis ? E.v[j] : null, valor_visor: vis ? E.v[j] : null, unidad: { clase: 'n', etiqueta: 'de 9 pruebas' }, estado: 'estimado', campo_visor: null });
      }
      out[t] = { encendida, cifras };
      if (t === 'Reparto') rotulaTarjetaReparto(E, out[t]);
      if (t === 'Riesgo y estado') {
        /* decisión C: si algún umbral no es el del libro, la tarjeta lo dice con las mismas palabras que la prueba */
        const propios = E.revision().filter((x) => x.umbral_propio).map((x) => ({ n: x.n, umbral_texto: x.umbral_texto, libro_texto: x.umbral_libro_texto, nota: x.nota }));
        out[t].umbrales_propios = propios;
        out[t].nota_umbrales = propios.length ? (propios.length === 1 ? 'Umbral propio en la prueba ' + propios[0].n + ': ' + propios[0].nota.replace(/^umbral propio; /, '') + '.' : 'Umbral propio en las pruebas ' + propios.map((x) => x.n).join(', ').replace(/, ([^,]*)$/, ' y $1') + ': el libro pide otra cosa en cada una.') : null;
      }
    });
    return out;
  }

  function armaPruebas(E) {
    const D = E.D, items = E.revision().map((it) => {
      const j = D.ix.get(it.id), c = j !== undefined ? D.cn[j] : null;
      return { n: it.n, id: it.id, etiqueta: c ? c.titulo : it.id, corta: c ? c.titulo : it.id, valor: it.valor, umbral: it.umbral, pasa_si: it.pasa_si, estado: it.estado, motivo: it.motivo, umbral_libro: it.umbral_libro, umbral_propio: it.umbral_propio, umbral_texto: it.umbral_texto, nota: it.nota };
    });
    const r = E.resultadoRevision();
    return { resultado: r === null ? 'sin revisión para fondos' : r, items };
  }

  function armaResultado(D, E, Ea, errores, opciones, plan2, cambioIds) {
    opciones = opciones || {};
    const nodos = [];
    D.cn.forEach((c) => {
      const i = c.i;
      const abierta = E.vis[i] && c.tipo === 'se_decide' && E.est[i] === null;
      if (!E.vis[i] || (c.oculto && !abierta)) return;
      nodos.push(nodoOut(E, Ea, c));
    });
    const reabiertas = E.reabiertas.map((r) => ({ id: r.id, motivo: r.motivo }));
    const abiertasUnas = E.abiertas.slice().sort((a, b) => cmpLlave(llaveOrden(D, a), llaveOrden(D, b))).map((i) => D.ids[i]);
    const abiertas = reabiertas.map((r) => r.id).concat(abiertasUnas);
    const pend = [];
    D.cn.forEach((c) => { const i = c.i; if (E.vis[i] && pideValor(c) && !c.raiz && !c.oculto && E.v[i] !== null && E.v[i] !== undefined && (!firmeE(E.est[i]) || valorPropio(E, c))) pend.push(c.id); });
    /* qué cambió y qué se ocultó */
    const que_cambio = [], ocultados = [];
    if (Ea) {
      for (let i = 0; i < D.N; i++) {
        if (D.kind[i] === 'dato') continue;
        const a = Ea.vis[i] ? Ea.v[i] : null, b = E.vis[i] ? E.v[i] : null;
        if (!igualV(a, b)) que_cambio.push({ id: D.ids[i], antes: a === undefined ? null : a, despues: b === undefined ? null : b });
        if (Ea.vis[i] && !E.vis[i] && D.kind[i] === 'nodo' && !D.cn[i].oculto) ocultados.push(D.ids[i]);
      }
    }
    const aparcados = [];
    Object.keys(plan2.valores || {}).forEach((id) => { const j = D.ix.get(id); if (j === undefined || D.kind[j] !== 'nodo' || (!E.vis[j] && E.esperan.indexOf(j) < 0)) aparcados.push({ id, razon: 'Su rama dejó de estar a la vista.' }); });
    Object.keys(plan2.aparcados || {}).forEach((id) => { if (!aparcados.some((q) => q.id === id)) aparcados.push({ id, razon: plan2.aparcados[id].razon || 'Aparcado.' }); });
    const tarjetas = armaTarjetas(E), pruebas = armaPruebas(E);
    /* alertas con ruta y sugerencias */
    const activas = evaluaAlertas(E), previas = {};
    if (Ea) evaluaAlertas(Ea).forEach((a) => { previas[a.al.id] = a; });
    const alertas = armaAlertas(D, E, Ea, activas, previas, plan2, cambioIds, opciones, errores);
    /* una referencia que cambió bajo un valor confirmado (D7 6.4): aviso informativo si la distancia pasa de 15 % */
    if (Ea) D.cn.forEach((c) => {
      const i = c.i; if (!(E.vis[i] && Ea.vis[i]) || E.est[i] !== 'confirmado' || Ea.est[i] !== 'confirmado' || !esNum(E.rf[i]) || !esNum(Ea.rf[i]) || igualV(E.rf[i], Ea.rf[i]) || !esNum(E.v[i]) || Math.abs(E.v[i]) < 1e-12) return;
      if (Math.abs(E.rf[i] - E.v[i]) / Math.abs(E.v[i]) > 0.15) alertas.push({ id: 'AL-REFCAMBIO-' + c.id, nivel: 'info', texto: 'La referencia de ' + c.titulo + ' cambió (de ' + fmtF(E, c, Ea.rf[i]) + ' a ' + fmtF(E, c, E.rf[i]) + ') y lo que confirmaste (' + fmtF(E, c, E.v[i]) + ') difiere más de 15 %.', sobre: [c.id], nodo: c.id, nueva: true, empeoro: false, medida: null, origen: null, origen_cambio: null, ruta: [], aristas: [], factores: [], sugerencias: null, estado_sugerencias: null, no_mostradas: 0, omitidas: [] });
    });
    /* rojos */
    const rojosN = new Set(), rojosT = new Set();
    alertas.forEach((a) => {
      if (a.nivel !== 'alto') return;
      rojosN.add(a.nodo); (a.sobre || []).forEach((s) => rojosN.add(s));
      [a.nodo].concat(a.sobre || []).forEach((id) => { const j = D.ix.get(id); if (j !== undefined && D.cn[j]) D.cn[j].tarjetas.forEach((t) => rojosT.add(t)); });
    });
    const rojasP = pruebas.items.filter((p) => p.estado === 'fuera').map((p) => p.n);
    if (rojasP.length) rojosT.add('Riesgo y estado');
    const nOrden = D.cn.map((c) => c.id); const rojos = { nodos: nOrden.filter((id) => rojosN.has(id)), tarjetas: TARJETAS.filter((t) => rojosT.has(t)), pruebas: rojasP };
    const res = {
      rotulo: ROTULO, definicion: { version: D.tipo.version, huella: D.huella }, contexto: { version: E.ctx.version, tipo: E.ctx.tipo, escenario: E.ctx.escenario },
      nodos, abiertas, en_espera: E.esperan.length, cupo: E.cupo, reabiertas, ocultados, aparcados, por_confirmar: { n: pend.length, ids: pend },
      alertas, sugerencias_pendientes: alertas.filter((a) => a.estado_sugerencias === 'diferidas').map((a) => a.id), rojos, tarjetas, pruebas, que_cambio, errores,
      plan: planResultante(D, E, plan2)
    };
    return res;
  }

  function armaAlertas(D, E, Ea, activas, previas, plan2, cambioIds, opciones, errores) {
    const salida = [];
    const modoSug = opciones.sugerencias || 'completas';
    const hayCambio = !!Ea;
    let delta = null, O = null;
    if (hayCambio) { delta = cambiados(D, Ea, E); O = (cambioIds || []).map((id) => D.ix.get(id)).filter((j) => j !== undefined); }
    const casoB = [];
    activas.forEach((a) => {
      const al = a.al, c = a.c, owner = al.owner;
      const pv = previas[al.id];
      const nueva = hayCambio ? !pv : false;
      const empeoro = hayCambio && !!pv && esNum(a.distancia) && esNum(pv.distancia) && a.distancia > pv.distancia + 1e-9;
      const o = {
        id: al.id, nivel: al.nivel, texto: textoAlerta(E, al), sobre: al.sobre || [], nodo: c.id, nueva, empeoro,
        medida: al.fMedida && al.meta ? { valor: nn(a.medida), meta: nn(a.meta), pasa_si: al.pasaSi, distancia: nn(a.distancia) } : null,
        origen: null, origen_cambio: null, ruta: [], aristas: [], factores: [], sugerencias: null, estado_sugerencias: null, no_mostradas: 0, omitidas: []
      };
      if (al.nivel !== 'info') {
        const extra = aristasDeAlerta(D, al);
        const casoA = hayCambio && O.length && (nueva || empeoro || delta.has(owner));
        if (casoA) {
          let camino = caminoCorto(D, O, owner, new Set(Array.from(delta).concat(O)), Ea, E, extra);
          if (!camino) camino = caminoCorto(D, O, owner, null, Ea, E, extra);
          o.origen = 'cambio';
          if (camino) { o.ruta = camino.map((j) => D.ids[j]); o.origen_cambio = o.ruta[0]; for (let k = 0; k + 1 < camino.length; k++) o.aristas.push({ de: D.ids[camino[k]], a: D.ids[camino[k + 1]], tipo: tipoArista(D, camino[k], camino[k + 1]) || 'formula' }); }
          else { o.ruta = [c.id]; o.origen_cambio = null; }
        } else { o.origen = 'peso'; casoB.push({ o, a }); }
      }
      salida.push(o);
    });
    if (casoB.length && opciones.rutas !== 'no') pesosCasoB(D, E, plan2, casoB);
    else casoB.forEach((q) => { q.o.ruta = [q.o.nodo]; });
    /* sugerencias */
    salida.forEach((o, k) => {
      const a = activas[k], al = a.al;
      if (o.nivel === 'info' || al.sugiereF === false || a.builtin) { o.estado_sugerencias = null; return; }
      if (modoSug === 'no') { o.estado_sugerencias = null; return; }
      if (modoSug === 'diferidas') { o.estado_sugerencias = 'diferidas'; o.sugerencias = null; return; }
      const s = sugiereAlerta(D, E, plan2, al, errores);
      o.sugerencias = s.sugerencias; o.estado_sugerencias = s.estado; o.no_mostradas = s.no_mostradas; o.omitidas = s.omitidas;
    });
    return salida;
  }

  /* Caso B de la ruta (D7 15.3): los factores que más pesan sobre la medida, moviéndolos de uno en uno. */
  function pesosCasoB(D, E, plan2, lista) {
    const cand = new Map();   // clave -> {id, cambio}
    const ancs = lista.map((q) => ancestrosDe(D, idsDeAlerta(D, q.a.al)));
    const union = new Set(); ancs.forEach((s) => s.forEach((j) => union.add(j)));
    union.forEach((j) => {
      if (D.kind[j] !== 'nodo') return; const c = D.cn[j]; if (c.tipo === 'calculado' || c.oculto || !E.vis[j] || E.v[j] === null || E.est[j] === 'confirmado' || c.raiz) return;
      const ch = perturba(D, E, c); if (ch) ch.forEach((x) => cand.set(x.clave, x));
    });
    const pesos = lista.map(() => []);
    const base = lista.map((q) => (esNum(q.a.medida) ? q.a.medida : null));
    cand.forEach((x) => {
      const p2 = aplicaCambio(D, E, plan2, { [x.nodo]: x.cambio }, []);
      const E2 = corre(D, p2);
      lista.forEach((q, k) => {
        if (!ancs[k].has(D.ix.get(x.nodo))) return;
        let peso = 0;
        if (q.a.al.fMedida && q.a.al.meta) { const m2 = q.a.al.fMedida(E2); if (esNum(m2) && base[k] !== null) peso = Math.abs(m2 - base[k]) / (Math.abs(base[k]) > 1e-12 ? Math.abs(base[k]) : 1); }
        else { const r = evaluaAlertas(E2, new Set([q.a.al.id])).find((z) => z.al.id === q.a.al.id); peso = r && r.activa ? 0 : 1; }
        if (peso > 0) pesos[k].push({ id: x.clave, peso, nodo: x.nodo });
      });
    });
    lista.forEach((q, k) => {
      const top = pesos[k].sort((a, b) => b.peso - a.peso || (a.id < b.id ? -1 : 1)).slice(0, 3);
      q.o.factores = top.map((t) => ({ id: t.id, peso: Math.round(t.peso * 1e6) / 1e6 }));
      if (top.length) {
        const camino = caminoCorto(D, [D.ix.get(top[0].nodo)], q.a.al.owner, null, null, null, aristasDeAlerta(D, q.a.al));
        q.o.ruta = camino ? camino.map((j) => D.ids[j]) : [q.o.nodo];
        for (let m = 0; m + 1 < (camino || []).length; m++) q.o.aristas.push({ de: D.ids[camino[m]], a: D.ids[camino[m + 1]], tipo: tipoArista(D, camino[m], camino[m + 1]) || 'formula' });
      } else q.o.ruta = [q.o.nodo];
    });
  }
  /* un movimiento chico por captura: ±10% del rango, o la opción vecina */
  function perturba(D, E, c) {
    const out = [], i = c.i;
    const sinR = E.mn[i] === null || E.mx[i] === null;
    const vv = (f) => factorAVista(E, c, f);
    const numerico = (c.tipo === 'se_busca' || c.tipo === 'regla_oficio' || (c.tipo === 'se_decide' && c.permiteOtro)) && !sinR && esNum(E.v[i]) && !c.compuesto;
    if (c.compuesto) {
      out.push(...vecina(c, E));
      (E.comps[i] || []).forEach((m) => {
        if (!m.activo || !esNum(m.min) || !esNum(m.max)) return;
        const d = 0.1 * (m.max - m.min); let v = (esNum(m.cantidad) ? m.cantidad : m.min) + d; if (v > m.max) v = (esNum(m.cantidad) ? m.cantidad : m.max) - d; v = Math.min(m.max, Math.max(m.min, v));
        out.push({ clave: c.id + '.' + m.clave, nodo: c.id, cambio: { componentes: { [m.clave]: { valor: v, unidad: m.unidad_catalogo } } } });
      });
      return out;
    }
    if (numerico) {
      const lo = vv(E.mn[i]), hi = vv(E.mx[i]), v = vv(E.v[i]); const d = 0.1 * (hi - lo);
      let v2 = v + d; if (v2 > hi) v2 = v - d; v2 = Math.min(hi, Math.max(lo, v2));
      if (v2 !== v) out.push({ clave: c.id, nodo: c.id, cambio: { valor: v2, estado: 'confirmado' } });
    }
    if ((c.tipo === 'se_decide' || c.fuentes) && c.opciones.length > 1 && !(numerico && c.tipo !== 'se_decide')) {
      if (!(c.tipo === 'se_decide' && c.permiteOtro && numerico)) out.push(...vecina(c, E));
    }
    return out;
  }
  function vecina(c, E) {
    const ops = c.opciones.slice().sort((a, b) => a.orden - b.orden), act = E.opc[c.i];
    let k = ops.findIndex((o) => o.clave === act); if (k < 0) k = 0;
    const nx = ops[k + 1] || ops[k - 1]; if (!nx) return [];
    return [{ clave: c.id, nodo: c.id, cambio: { opcion: nx.clave, estado: 'decidido' } }];
  }


  /* ═════════════════════════ SUGERENCIAS CALCULADAS (D7 §15.4) ═════════════════════════ */
  function sufijo(c) { const cl = c.unidad.clase; return cl === 'mxn_m2' ? ' por m²' : cl === 'u_mes' ? ' al mes' : cl === 'm2' ? ' m²' : cl === 'mes' ? ' meses' : ''; }
  const fmtSug = (E, c, f) => fmtF(E, c, f) + sufijo(c);
  const alPaso = (x, mn, paso, modo) => {
    let k = (x - mn) / paso; k = modo === 'up' ? Math.ceil(k - 1e-9) : modo === 'down' ? Math.floor(k + 1e-9) : Math.floor(k + 0.5 + 1e-9);
    return Number((mn + k * paso).toFixed(10));
  };
  function estadoAlerta(E2, al) {
    if (!E2.vis[al.owner]) return { activa: false, dist: 0, medida: null };
    let m = null, t = null, pasa = null, dist = null;
    if (al.fMedida && al.meta) {
      m = al.fMedida(E2); const ft = elige(al.meta, E2.ctx); t = ft ? ft(E2) : null; pasa = cmpMeta(m, t, al.pasaSi);
      dist = pasa === false ? (Math.abs(t) > 1e-12 ? Math.abs(m - t) / Math.abs(t) : Math.abs(m - t)) : pasa === true ? 0 : null;
    }
    const activa = al.fCuando ? al.fCuando(E2) === true : pasa === false;
    return { activa, dist, medida: m, meta: t };
  }
  function clavesAltosActivos(E) { return new Set(evaluaAlertas(E).filter((a) => a.al.nivel === 'alto' && !a.builtin).map((a) => a.al.id)); }

  function sugiereAlerta(D, E, plan, al, errores) {
    const ctx = E.ctx;
    const celNum = (cel, def) => { const f = elige(cel, ctx); const x = f ? f(E_VACIO) : def; return esNum(x) ? x : def; };
    const maxSug = celNum(D.tipo.maxSug, 5), topeCorr = celNum(D.tipo.topeCorridas, 300), topeMs = celNum(D.tipo.topeMs, 250);
    const base = estadoAlerta(E, al);
    const res = { estado: 'ok', sugerencias: [], no_mostradas: 0, omitidas: [], mensaje: null };
    if (!base.activa) return res;
    if (topeMs <= 0 || topeCorr <= 0) { res.estado = 'tiempo'; res.mensaje = 'Se acabó el tiempo para buscar sugerencias.'; return res; }
    const t0 = ahora(); let corridas = 0, agotado = false;
    const hayTiempo = () => { if (corridas >= topeCorr || ahora() - t0 > topeMs) { agotado = true; return false; } return true; };
    const altosBase = clavesAltosActivos(E);
    const duena = D.cn[al.owner];
    const corrida = (cambio) => {
      const p2 = aplicaCambio(D, E, plan, cambio, []); corridas++;
      const E2 = corre(D, p2); const r = estadoAlerta(E2, al);
      let col = []; if (!r.activa) { const ya = clavesAltosActivos(E2); col = Array.from(ya).filter((id) => !altosBase.has(id) && id !== al.id).sort(); }
      return { E2, activa: r.activa, dist: r.dist, medida: r.medida, col };
    };
    /* palancas */
    let tokens = al.palancas ? al.palancas.slice() : null;
    if (!tokens) {
      const anc = ancestrosDe(D, idsDeAlerta(D, al)); tokens = [];
      D.cn.forEach((c) => { if (anc.has(c.i) && c.tipo !== 'calculado' && !c.raiz && E.vis[c.i] && E.v[c.i] !== null && !c.oculto) tokens.push(c.id); });
    }
    const cands = [], tocadas = [];
    let mejorAcerca = null;
    let cur = null;
    const anota = (cand, r) => { if (r.dist !== null && (!mejorAcerca || r.dist < mejorAcerca.dist - 1e-12)) mejorAcerca = { cand, dist: r.dist, medida: r.medida, cur }; };
    const rotuloOp = (c, clave) => { const o = c.opciones.find((q) => q.clave === clave); return o ? o.nombre : String(clave); };
    const posOpc = (c) => c.opciones.slice().sort((a, b) => a.orden - b.orden).map((o) => o.clave);

    tokens.forEach((tk, ordenPal) => {
      if (agotado) return;
      const [id, clave] = tk.split('.');
      const j = D.ix.get(id); if (j === undefined || D.kind[j] !== 'nodo') return;
      const c = D.cn[j];
      if (c.tipo === 'calculado' || !E.vis[j]) return;
      if (E.est[j] === 'confirmado') { if (res.omitidas.indexOf(tk) < 0) res.omitidas.push(tk); return; }
      if (E.v[j] === null && !c.compuesto) return;
      tocadas.push(tk); cur = { c, tk, clave };
      const nuevo = (o) => cands.push(Object.assign({ palanca: tk, nodo: id, ordenPal }, o));

      /* búsqueda numérica (algoritmo exacto de 15.4) */
      const numerica = (cambiaPorValor, mn, mx, paso, a, formato, extra) => {
        if (!esNum(mn) || !esNum(mx) || !esNum(paso) || paso <= 0 || mx <= mn) return;
        const cache = new Map();
        const prueba = (v) => { const k = Number(v.toFixed(10)); if (cache.has(k)) return cache.get(k); if (!hayTiempo()) return { activa: true, dist: null, col: [], E2: null, abortado: true }; const r = corrida({ [id]: cambiaPorValor(k) }); cache.set(k, r); return r; };
        const pts = Array.from(new Set([a].concat(Array.from({ length: 9 }, (_, k) => alPaso(mn + k * (mx - mn) / 8, mn, paso))))).sort((x, y) => x - y);
        pts.forEach((p) => { if (p !== a) { const r = prueba(p); if (r.dist !== null && r.activa) anota({ v: p, a, formato, extra }, r); } });
        const buenos = pts.filter((p) => p !== a && cache.has(Number(p.toFixed(10))) && !cache.get(Number(p.toFixed(10))).activa);
        if (!buenos.length) return;
        buenos.sort((x, y) => Math.abs(x - a) - Math.abs(y - a) || x - y);
        let q = buenos[0]; const iq = pts.indexOf(q); let n = q > a ? pts[iq - 1] : pts[iq + 1];
        if (n === undefined) n = a;
        let lo = n, hi = q;
        for (let it = 0; it < 12 && Math.abs(hi - lo) >= paso / 2; it++) {
          const mid = (lo + hi) / 2; const r = prueba(mid);
          if (r.abortado) return;
          if (!r.activa) hi = mid; else lo = mid;
        }
        const arriba = hi > lo; let v = alPaso(hi, mn, paso, arriba ? 'up' : 'down'); v = Math.min(mx, Math.max(mn, v));
        let r = prueba(v), extraPasos = 0;
        while (r.activa && extraPasos < 2 && !r.abortado) { v = Math.min(mx, Math.max(mn, alPaso(v + (arriba ? paso : -paso), mn, paso))); r = prueba(v); extraPasos++; }
        if (r.activa || r.abortado) return;
        /* sin paso de más: se retrocede hacia `a` mientras el valor anterior del paso siga pasando */
        for (;;) {
          const w = alPaso(v - (arriba ? paso : -paso), mn, paso);
          if (!(arriba ? w > a : w < a) || w < mn || w > mx) break;
          const rw = prueba(w);
          if (rw.abortado || rw.activa) break;
          v = w; r = rw;
        }
        nuevo({ tipo: extra.tipo, valor: v, antes: a, despues: v, r, esfuerzo: Math.abs(v - a) / (mx - mn), cambio: cambiaPorValor(v), formato, extra });
      };

      if (c.compuesto) {
        const comps = E.comps[j] || [];
        const act = E.opc[j];
        const mkText = (m, antes, despues) => (despues === 0 ? 'Quita «' + m.nombre + '» (' + miles(m.m2 || 0, 0) + ' m²) y la prueba pasa.' : (despues > antes ? 'Sube' : 'Baja') + ' «' + m.nombre + '» de ' + fmtComp(m, antes) + ' a ' + fmtComp(m, despues) + ' y la prueba pasa.');
        const fmtComp = (m, x) => (m.unidad_catalogo === 'pct' ? String(Math.round(x * 1000) / 10) + '%' : miles(x, 0) + ' m²');
        const sobreComp = (m) => {
          if (!m.activo) {
            const r = corrida({ [id]: { componentes: { [m.clave]: { activo: true } } } }); anota({ enc: m }, r);
            if (!r.activa) nuevo({ tipo: 'componente', cambio: { componentes: { [m.clave]: { activo: true } } }, antes: null, despues: null, r, esfuerzo: 1, texto: 'Pon «' + m.nombre + '» y la prueba pasa.', subord: 1, compClave: m.clave });
            return;
          }
          if (esNum(m.min) && m.min === 0 && hayTiempo()) {
            const ch = { componentes: { [m.clave]: { activo: false } } }; const r = corrida({ [id]: ch });
            if (!r.activa) nuevo({ tipo: 'componente', cambio: ch, antes: null, despues: 0, r, esfuerzo: 1, texto: mkText(m, 0, 0), subord: 1, compClave: m.clave });
            else anota({ off: m }, r);
          }
          const cat = m.unidad_catalogo; let a = m.cantidad;
          if (m.unidad_base !== cat) { a = cat === 'pct' ? (esNum(m.pct) ? m.pct : null) : m.m2; }
          if (!esNum(a)) return;
          numerica((v) => ({ componentes: { [m.clave]: { valor: v, unidad: cat } } }), m.min, m.max, m.paso, a, null, { tipo: 'componente', comp: m });
          const ult = cands[cands.length - 1];
          if (ult && ult.extra && ult.extra.comp === m && ult.palanca === tk) { ult.texto = mkText(m, a, ult.despues); ult.subord = 2; ult.compClave = m.clave; }
        };
        if (!clave) {
          /* (a) preajustes distintos del actual */
          const claves = posOpc(c);
          const ia = Math.max(0, claves.indexOf(act));
          claves.forEach((k, pos) => {
            if (k === act || !hayTiempo()) return;
            const r = corrida({ [id]: { opcion: k, estado: 'decidido' } }); anota({ preset: k }, r);
            if (!r.activa) nuevo({ tipo: 'opcion', cambio: { opcion: k, estado: 'decidido' }, antes: act, despues: k, r, esfuerzo: claves.length > 1 ? Math.abs(pos - ia) / (claves.length - 1) : 1, texto: 'Cambia ' + c.titulo + ' de «' + (act === 'personalizado' ? 'Personalizado' : rotuloOp(c, act)) + '» a «' + rotuloOp(c, k) + '» y la prueba pasa.', subord: 0 });
          });
          comps.filter((m) => m.activo).forEach((m) => { if (!agotado) sobreComp(m); });
        } else { const m = comps.find((q) => q.clave === clave); if (m) sobreComp(m); }
        return;
      }
      /* nodos con número */
      const rangoOk = E.mn[j] !== null && E.mx[j] !== null && E.pa[j] !== null;
      const numeroPosible = rangoOk && ((c.tipo === 'se_busca' || c.tipo === 'regla_oficio') || (c.tipo === 'se_decide' && c.permiteOtro)) && esNum(E.v[j]);
      if (c.tipo === 'se_decide' && !c.permiteOtro || c.fuentes) {
        const claves = posOpc(c), act = E.opc[j], ia = Math.max(0, claves.indexOf(act));
        claves.forEach((k, pos) => {
          if (k === act || !hayTiempo()) return;
          const ch = { opcion: k, estado: 'decidido' }; const r = corrida({ [id]: ch }); anota({ opc: k }, r);
          if (r.activa) return;
          if (c.fuentes) {
            const f = fuentesInfo(E, c).find((q) => q.clave === k);
            nuevo({ tipo: 'fuente', cambio: ch, antes: act, despues: k, r, esfuerzo: 1, texto: 'Usa la fuente «' + (f ? f.nombre : k) + '» (' + (f && f.valor !== null ? fmtSug(E, c, planAFactor(E, c, f.valor)) : '—') + ') en ' + c.titulo + ' y la prueba pasa.' });
          } else nuevo({ tipo: 'opcion', cambio: ch, antes: act, despues: k, r, esfuerzo: claves.length > 1 ? Math.abs(pos - ia) / (claves.length - 1) : 1, texto: 'Cambia ' + c.titulo + ' de «' + (act ? rotuloOp(c, act) : fmtSug(E, c, E.v[j])) + '» a «' + rotuloOp(c, k) + '» y la prueba pasa.' });
        });
      }
      if (numeroPosible && !agotado) {
        const vv = (f) => factorAVista(E, c, f), lo = vv(E.mn[j]), hi = vv(E.mx[j]), pa = vv(E.pa[j]) - (c.vista ? vv(0) : 0), a = vv(E.v[j]);
        numerica((v) => (c.tipo === 'se_decide' ? { valor: v, estado: 'decidido' } : { valor: v, estado: 'decidido', marca: 'sugerido', fuente: 'Sugerencia del motor · ' + al.id }), lo, hi, pa > 0 ? pa : E.pa[j] / (c.escala || 1), a, null, { tipo: 'numero' });
        const ult = cands[cands.length - 1];
        if (ult && ult.palanca === tk && ult.extra && ult.extra.tipo === 'numero' && !ult.texto) ult.texto = (ult.despues > ult.antes ? 'Sube ' : 'Baja ') + c.titulo + ' de ' + fmtF(E, c, planAFactor(E, c, ult.antes)) + ' a ' + fmtSug(E, c, planAFactor(E, c, ult.despues)) + ' y la prueba pasa.';
      }
    });

    /* identidad: dos candidatas que dejan el plan igual son una sola (se conserva la primera) */
    const vistas = new Set(), unicas = [];
    cands.forEach((cd) => {
      let clave;
      const r = cd.r; const jn = D.ix.get(cd.nodo), cc = D.cn[jn];
      if (cc && cc.compuesto && r && r.E2) clave = cd.nodo + '|' + (r.E2.comps[jn] || []).filter((m) => m.activo && esNum(m.m2) && m.m2 > 1e-6).map((m) => m.clave + ':' + m.m2.toFixed(6)).join(',');
      else clave = cd.nodo + '|' + canonico(cd.cambio);
      if (vistas.has(clave)) return; vistas.add(clave); unicas.push(cd);
    });
    const buenas = unicas.filter((cd) => cd.r && !cd.r.activa).map((cd) => {
      const med = cd.r.medida;
      return { palanca: cd.palanca, nodo: cd.nodo, cambio: cd.cambio, tipo: cd.tipo, antes: cd.antes === undefined ? null : cd.antes, despues: cd.despues === undefined ? null : cd.despues, texto: cd.texto, esfuerzo: Math.round(cd.esfuerzo * 1e9) / 1e9, pasa: true, colaterales: cd.r.col, medida_despues: nn(med), cambio_evalua: { [cd.nodo]: clonar(cd.cambio) }, _o: cd.ordenPal, _s: cd.subord || 0 };
    });
    if (al.textoSug) buenas.forEach((b) => { const cc = D.cn[D.ix.get(b.nodo)]; b.texto = al.textoSug.replace(/\{nodo\}/g, cc ? cc.titulo : b.nodo).replace(/\{palanca\}/g, b.palanca).replace(/\{antes\}/g, b.antes === null ? '—' : String(b.antes)).replace(/\{despues\}/g, b.despues === null ? '—' : String(b.despues)); });
    /* cierre de la frase: «y la prueba pasa» solo si la alerta es una de las 9 pruebas de riesgo (nodo RV-01…RV-09);
       en las demás, el texto propio de la regla (columna texto_cierre) o, si no hay, «y la alerta se apaga» */
    const cierre = esPruebaRV(duena.id) ? 'y la prueba pasa' : (al.textoCierre ? al.textoCierre.replace(/[.\s]+$/, '') : 'y la alerta se apaga');
    if (cierre !== 'y la prueba pasa') buenas.forEach((b) => { b.texto = b.texto.replace(/ y la prueba pasa(?=[.,])/, ' ' + cierre); });
    const duenoDeAlerta = (id) => { let r = null; D.cn.forEach((q) => q.alertas.forEach((x) => { if (x.id === id) r = q; })); return r; };
    buenas.forEach((b) => { if (b.colaterales.length) b.texto = b.texto.replace(new RegExp(' ' + cierre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.$'), ' ' + cierre + ', pero ' + b.colaterales.map((id) => { const q = duenoDeAlerta(id); return '«' + (q ? q.titulo : id) + '»'; }).join(' y ') + (b.colaterales.length > 1 ? ' dejarían de pasar.' : ' dejaría de pasar.')); });
    buenas.sort((a, b) => (a.colaterales.length > 0) - (b.colaterales.length > 0) || a.colaterales.length - b.colaterales.length || a.esfuerzo - b.esfuerzo || a._o - b._o || a._s - b._s || (a.palanca < b.palanca ? -1 : a.palanca > b.palanca ? 1 : 0));
    buenas.forEach((b) => { delete b._o; delete b._s; });
    res.sugerencias = buenas.slice(0, maxSug); res.no_mostradas = Math.max(0, buenas.length - maxSug);
    if (agotado) { res.estado = 'tiempo'; res.mensaje = 'Se acabó el tiempo de búsqueda: se muestra lo encontrado.'; return res; }
    if (!buenas.length) {
      if (!tocadas.length) { res.estado = 'sin_palancas'; res.mensaje = 'Todo lo que se podría mover está confirmado.'; return res; }
      res.estado = 'ninguna_sola';
      if (mejorAcerca && al.fMedida && al.meta) {
        const ac = mejorAcerca.cand, cu = mejorAcerca.cur; let frase = '';
        const mTxt = fmtF(E, duena, mejorAcerca.medida), tTxt = fmtF(E, duena, base.meta);
        const nom = cu.c.titulo;
        if (ac.v !== undefined) {
          const comp = ac.extra && ac.extra.comp;
          if (comp) frase = 'la que más acerca: ' + (ac.v > ac.a ? 'sube' : 'baja') + ' «' + comp.nombre + '» de ' + (comp.unidad_catalogo === 'pct' ? String(Math.round(ac.a * 1000) / 10) + '%' : miles(ac.a, 0) + ' m²') + ' a ' + (comp.unidad_catalogo === 'pct' ? String(Math.round(ac.v * 1000) / 10) + '%' : miles(ac.v, 0) + ' m²');
          else frase = 'la que más acerca: ' + (ac.v > ac.a ? 'sube' : 'baja') + ' ' + nom + ' de ' + fmtF(E, cu.c, planAFactor(E, cu.c, ac.a)) + ' a ' + fmtSug(E, cu.c, planAFactor(E, cu.c, ac.v));
        }
        else if (ac.opc) frase = 'la que más acerca: cambia ' + nom + ' a «' + rotuloOp(cu.c, ac.opc) + '»';
        else if (ac.preset) frase = 'la que más acerca: cambia ' + nom + ' a «' + rotuloOp(cu.c, ac.preset) + '»';
        else if (ac.off) frase = 'la que más acerca: quita «' + ac.off.nombre + '»';
        else if (ac.enc) frase = 'la que más acerca: pon «' + ac.enc.nombre + '»';
        res.mensaje = 'Ninguna palanca sola alcanza. ' + frase.charAt(0).toUpperCase() + frase.slice(1) + '; ' + (esPruebaRV(duena.id) ? 'la prueba' : 'la medida') + ' queda en ' + mTxt + ' y pide ' + tTxt + '.';
        res.sugerencias = [{ palanca: null, tipo: 'ninguna', antes: null, despues: null, texto: res.mensaje, esfuerzo: null, pasa: false, colaterales: [], medida_despues: nn(mejorAcerca.medida) }];
      } else {
        const pesos = tocadas.slice(0, 2).join(', ');
        res.mensaje = 'Ninguna de las ' + tocadas.length + ' palancas probadas corrige esto por sí sola. Lo que más pesa: ' + pesos + '.';
        res.sugerencias = [{ palanca: null, tipo: 'ninguna', antes: null, despues: null, texto: res.mensaje, esfuerzo: null, pasa: false, colaterales: [], medida_despues: null }];
      }
    }
    return res;
  }


  /* ═════════════════════════ COMPARADOR ═════════════════════════ */
  const esPruebaRV = (id) => /^RV-0[1-9]$/.test(id);
  const epsMedida = (c) => { const cl = c.unidad.clase; return cl === 'pct' ? 5e-4 : cl === 'mxn' ? (c.escala && c.escala >= 1e6 ? 5e4 : 0.5) : cl === 'mes' || cl === 'n' ? 0.5 : cl === 'veces' ? 5e-3 : 1e-6; };

  function atomosDe(D, cambios, errores) {
    const atomos = [];
    Object.keys(cambios || {}).forEach((id) => {
      const ch = cambios[id] || {};
      if (id === '@contexto') { atomos.push({ key: '@contexto', id, cambio: ch, tipo: 'contexto' }); return; }
      const idx = D.ix.get(id);
      if (idx === undefined || D.kind[idx] !== 'nodo' || D.cn[idx].tipo === 'calculado') { errores.push({ codigo: 'id_desconocido', id, mensaje: id + (idx !== undefined && D.kind[idx] === 'nodo' ? ' es un resultado calculado: no se compara.' : ' no existe.') }); return; }
      if (ch.componentes) {
        const aparte = Object.assign({}, ch); delete aparte.componentes;
        if (aparte.opcion || aparte.valor !== undefined || aparte.estado) atomos.push({ key: id, id, cambio: aparte, tipo: 'nodo' });
        Object.keys(ch.componentes).forEach((k) => atomos.push({ key: id + '.' + k, id, cambio: { componentes: { [k]: ch.componentes[k] } }, tipo: 'componente' }));
      } else atomos.push({ key: id, id, cambio: ch, tipo: 'nodo' });
    });
    return atomos;
  }
  function planConAtomos(D, E0, plan, atomos, errores, nuevos) {
    let p = plan; const nv = nuevos || [];
    atomos.forEach((a) => { p = aplicaCambio(D, E0, p, { [a.id]: a.cambio }, errores, nv); });
    return p;
  }
  function valorMedida(E, i) { return E.vis[i] ? nn(E.v[i]) : null; }
  function frasesCambio(D, E, a) { return frasesCambio0(D, E, a) + (a.nuevo ? ' (nuevo en B: A todavía no lo tenía a la vista)' : ''); }
  function frasesCambio0(D, E, a) {
    const c = D.cn[D.ix.get(a.id)] || null;
    if (!c) return a.key;
    if (a.tipo === 'contexto') return 'versión o escenario del plan';
    if (a.tipo === 'componente') { const k = a.key.split('.')[1], ch = ((a.cambio || {}).componentes || {})[k] || {}; const act = ((E.comps[c.i]) || []).find((m) => m.clave === k) || {}; return 'el área «' + ((c.comps.find((m) => m.clave === k) || {}).nombre || ch.nombre || act.nombre || k) + '» de ' + c.titulo; }
    if (a.cambio.opcion) return c.titulo + ' = «' + ((c.opciones.find((o) => o.clave === a.cambio.opcion) || {}).nombre || a.cambio.opcion) + '»';
    if (a.cambio.valor !== undefined) return c.titulo + ' = ' + fmtSug(E, c, planAFactor(E, c, a.cambio.valor));
    return c.titulo;
  }

  function comparaAB(D, plan, cambios, errores, EA, antesInfo) {
    const atomos = atomosDe(D, cambios, errores);
    const nuevos = [];   // M6: datos que A todavía no tenía a la vista: se tratan como «nuevo en B»
    const planB = planConAtomos(D, EA, plan, atomos, errores, nuevos);
    const EB = corre(D, planB);
    atomos.forEach((a) => { a.nuevo = a.tipo !== 'contexto' && nuevos.indexOf(a.id) >= 0; });
    const nuevos_en_b = [];
    nuevos.forEach((id) => {
      const j = D.ix.get(id), c = D.cn[j];
      if (!EB.vis[j]) errores.push({ codigo: 'nodo_no_visible', id, mensaje: c.titulo + ' todavía no está a la vista, ni en A ni en B (aún falta lo que lo abre): no hay nada que comparar.' });
      else nuevos_en_b.push({ id, titulo: c.titulo, valor_b: nn(EB.v[j]), texto: c.titulo + ' es nuevo en B: A todavía no lo tenía a la vista.' });
    });
    const opcs = { sugerencias: 'no', rutas: 'no' };
    const A = armaResultado(D, EA, null, [], opcs, plan, []);
    const B = armaResultado(D, EB, EA, [], opcs, planB, atomos.map((a) => a.id));
    const difieren = [];
    D.orden.forEach((i) => { if (D.kind[i] === 'dato') return; const a = valorMedida(EA, i), b = valorMedida(EB, i); if (!igualV(a, b)) difieren.push({ id: D.ids[i], a, b }); });
    /* medidas y marcas */
    const medidasNodos = D.cn.filter((c) => c.sentido && !esPruebaRV(c.id));
    const medidas = [];
    medidasNodos.forEach((c) => {
      const a = valorMedida(EA, c.i), b = valorMedida(EB, c.i);
      let mejor = 'na', rojo = null;
      if (esNum(a) && esNum(b)) {
        if (c.sentido === 'dato') mejor = 'dato';
        else if (Math.abs(a - b) <= epsMedida(c)) mejor = 'empate';
        else { const masEsMejor = c.sentido === 'mas_es_mejor'; mejor = (b > a) === masEsMejor ? 'B' : 'A'; }
        if (mejor === 'A' || mejor === 'B') {
          const buena = mejor === 'A' ? a : b, mala = mejor === 'A' ? b : a, peorEs = mejor === 'A' ? 'B' : 'A';
          const um = c.umbral ? evalCel(EA, c.umbral) : null;
          if (c.id === 'RV-10') rojo = peorEs;
          else if (esNum(um)) { const dif = Math.abs(buena - mala); const exc = c.unidad.clase === 'pct' ? dif : dif / (Math.abs(buena) > 1e-12 ? Math.abs(buena) : 1); if (exc > um + 1e-12) rojo = peorEs; }
        }
      }
      medidas.push({ id: c.id, etiqueta: c.titulo, a: nn(a), b: nn(b), mejor, rojo });
    });
    /* atribución a cada decisión (D7 8.3): cambiar una a la vez */
    /* las cifras de las 7 tarjetas también reciben atribución (para `aportes`), además de las medidas del comparador */
    const cifrasT = new Map();
    TARJETAS.forEach((t) => (B.tarjetas[t] ? B.tarjetas[t].cifras : []).forEach((f) => {
      const j = D.ix.get(f.id); if (j === undefined || D.kind[j] !== 'nodo') return;
      if (!cifrasT.has(f.id)) cifrasT.set(f.id, { c: D.cn[j], etiqueta: f.etiqueta, tarjetas: [] });
      cifrasT.get(f.id).tarjetas.push(t);
    }));
    const nodosAtr = medidasNodos.slice();
    cifrasT.forEach((v) => { if (nodosAtr.indexOf(v.c) < 0) { const a = valorMedida(EA, v.c.i), b = valorMedida(EB, v.c.i); if (esNum(a) && esNum(b) && a !== b) nodosAtr.push(v.c); } });
    const k = atomos.length, exacto = k <= 4, atribucion = [], interaccion = [];
    if (k >= 1) {
      const delante = atomos.map((a) => corre(D, planConAtomos(D, EA, plan, [a], [])));
      const detras = exacto ? atomos.map((a, q) => corre(D, planConAtomos(D, EA, plan, atomos.filter((_, r) => r !== q), []))) : null;
      nodosAtr.forEach((c) => {
        const mA = valorMedida(EA, c.i), mB = valorMedida(EB, c.i); if (!esNum(mA) || !esNum(mB)) return;
        let suma = 0;
        atomos.forEach((a, q) => {
          const f = valorMedida(delante[q], c.i); let ef = esNum(f) ? f - mA : null;
          if (exacto && ef !== null) { const bq = valorMedida(detras[q], c.i); if (esNum(bq)) ef = (ef + (mB - bq)) / 2; }
          if (ef !== null) suma += ef;
          atribucion.push({ decision: a.key, medida: c.id, efecto: ef, aproximada: !exacto });
        });
        if (k > 1) interaccion.push({ medida: c.id, efecto: (mB - mA) - suma });
      });
    }
    /* causas con frases de plantilla. La decisión que se nombra es la que MÁS aporta en el sentido del cambio según la
       atribución de arriba (no la del camino más corto del grafo); el «porque» sale del camino desde esa decisión. */
    const causas = [], cambiadosSet = cambiados(D, EA, EB);
    const ordenadas = medidas.filter((m) => esNum(m.a) && esNum(m.b) && m.a !== m.b && m.mejor !== 'empate').map((m) => { const c = D.cn[D.ix.get(m.id)]; return { m, c, rel: Math.abs(m.b - m.a) / (Math.abs(m.a) > 1e-12 ? Math.abs(m.a) : 1) }; }).sort((x, y) => y.rel - x.rel).slice(0, 3);
    ordenadas.forEach(({ m, c }) => {
      const dir = m.b > m.a ? 1 : -1;
      const pos = atribucion.filter((x) => x.medida === m.id && esNum(x.efecto) && x.efecto * dir > epsMedida(c) * 1e-3)
        .sort((x, y) => y.efecto * dir - x.efecto * dir || (x.decision < y.decision ? -1 : x.decision > y.decision ? 1 : 0));
      const org = pos.length ? atomos.find((a) => a.key === pos[0].decision) : null;
      let frase = c.titulo + (m.b > m.a ? ' sube' : ' baja') + ' de ' + fmtF(EA, c, m.a) + ' a ' + fmtF(EA, c, m.b);
      const oj = org ? D.ix.get(org.id) : undefined;
      const camino = oj !== undefined ? caminoCorto(D, [oj], c.i, cambiadosSet, EA, EB) : null;
      if (camino && camino.length > 2) {
        const j = camino[camino.length - 2], cj = D.cn[j] || null;
        if (cj) frase += ' porque ' + cj.titulo + ' pasa de ' + fmtF(EA, cj, valorMedida(EA, j)) + ' a ' + fmtF(EB, cj, valorMedida(EB, j));
        else frase += ' porque cambia «' + D.ids[j] + '»';
      }
      if (org) frase += ' (cambio: ' + frasesCambio(D, EA, org) + ')';
      else if (k > 1) frase += ' (cambio: el efecto combinado de las decisiones)';
      else if (atomos[0]) frase += ' (cambio: ' + frasesCambio(D, EA, atomos[0]) + ')';
      causas.push(frase + '.');
    });
    /* aportes por decisión de cada cifra de las tarjetas: lista ordenada por tamaño, con signo, lista para pintarse */
    const dTexto = (c, base, d) => {
      const da = c.vista && esNum(base) ? factorAVista(EA, c, base + d) - factorAVista(EA, c, base) : d, ab = Math.abs(da), cl = c.unidad.clase;
      const t = cl === 'pct' ? String(Math.round(ab * 1000) / 10) + ' pts' : fmtValor(c, ab) + (cl === 'mes' ? ' meses' : '');
      return (da > 0 ? '+' : da < 0 ? '−' : '') + t;
    };
    const aportes = [];
    cifrasT.forEach((v, id) => {
      const c = v.c, a = valorMedida(EA, c.i), b = valorMedida(EB, c.i);
      const o = { id, etiqueta: v.etiqueta, tarjetas: v.tarjetas, a: nn(a), b: nn(b), delta: null, cambia: false, delta_texto: null, aproximada: !exacto, lista: [] };
      if (esNum(a) && esNum(b)) {
        const eps = epsMedida(c); o.delta = b - a; o.cambia = Math.abs(b - a) > eps; o.delta_texto = o.cambia ? dTexto(c, a, b - a) : '0';
        const filas = atribucion.filter((x) => x.medida === id && esNum(x.efecto)).map((x) => { const at = atomos.find((q) => q.key === x.decision); return { decision: x.decision, id: at ? at.id : x.decision, texto: at ? frasesCambio(D, EA, at) : x.decision, efecto: x.efecto, signo: x.efecto > eps ? '+' : x.efecto < -eps ? '-' : '0', efecto_texto: Math.abs(x.efecto) > eps ? dTexto(c, a, x.efecto) : '0', es_interaccion: false }; });
        const inter = interaccion.find((x) => x.medida === id);
        if (inter && Math.abs(inter.efecto) > eps * 0.1) filas.push({ decision: '@interaccion', id: null, texto: 'Las decisiones juntas (efecto combinado)', efecto: inter.efecto, signo: inter.efecto > 0 ? '+' : '-', efecto_texto: dTexto(c, a, inter.efecto), es_interaccion: true });
        filas.sort((x, y) => Math.abs(y.efecto) - Math.abs(x.efecto) || (x.decision < y.decision ? -1 : x.decision > y.decision ? 1 : 0));
        const tot = filas.reduce((q, x) => q + Math.abs(x.efecto), 0);
        filas.forEach((x) => { x.parte = tot > 0 ? Math.round(Math.abs(x.efecto) / tot * 1e4) / 1e4 : 0; });
        o.lista = filas;
      }
      aportes.push(o);
    });
    const veredicto = veredictoDe(medidas, medidas.filter((m) => m.rojo).map((m) => ({ id: m.id, en: m.rojo })));
    return { A, B, difieren, medidas, atribucion, interaccion, aportes, causas, veredicto, errores, nuevos_en_b };
  }

  /* Veredicto en palabras (reglas simples; el texto de las reglas está en REGLAS_VEREDICTO y en D-motor-notas.md). */
  const REGLAS_VEREDICTO = [
    'Se miran 4 ejes, en este orden de importancia: utilidad (más es mejor), pruebas que pasan (más es mejor), dinero necesario (menos es mejor) y plazo total (menos es mejor).',
    'Un eje solo cuenta si hay cifra en A y en B y la diferencia pasa de la tolerancia de la medida (la misma de las marcas «mejor en»); si no, es empate y no se menciona.',
    'Gana la opción que es mejor en el primer eje con diferencia (por lo normal la utilidad). Se nombra a esa opción.',
    'La frase dice primero lo que la ganadora hace mejor y, después de «pero», lo que hace peor, en el orden utilidad, dinero, pruebas, plazo. Si no hay nada peor, no lleva «pero».',
    'Si ningún eje difiere: «A y B dan lo mismo…». Si faltan cifras en todos los ejes: «Todavía no hay cifras para comparar.»'
  ];
  const EJES_VEREDICTO = [
    { id: 'R-03', eje: 'utilidad', bien: 'deja más utilidad', mal: 'deja menos utilidad', prio: 1 },
    { id: 'R-11', eje: 'dinero', bien: 'necesita menos dinero', mal: 'necesita más dinero', prio: 3 },
    { id: 'RV-10', eje: 'pruebas', bien: 'pasa más pruebas', mal: 'pasa menos pruebas', prio: 2 },
    { id: 'K-12', eje: 'plazo', bien: 'termina antes', mal: 'tarda más', prio: 4 }
  ];
  function veredictoDe(medidas, rojas) {
    const cuenta = { A: 0, B: 0, empate: 0 }; medidas.forEach((m) => { if (cuenta[m.mejor] !== undefined) cuenta[m.mejor]++; });
    const total = medidas.filter((m) => ['A', 'B', 'empate'].indexOf(m.mejor) >= 0).length;
    const texto = 'A es mejor en ' + cuenta.A + ' de ' + total + ' medidas; B en ' + cuenta.B + '; empatan en ' + cuenta.empate + '.' + (rojas.length ? ' Marcas rojas: ' + rojas.map((r) => { const m = medidas.find((x) => x.id === r.id); return (m && m.etiqueta ? m.etiqueta : 'una medida') + ' (' + r.en + ')'; }).join(', ') + '.' : '');
    const ejes = EJES_VEREDICTO.map((e) => { const m = medidas.find((x) => x.id === e.id); return m && esNum(m.a) && esNum(m.b) ? { eje: e.eje, id: e.id, a: m.a, b: m.b, mejor: m.mejor, e } : null; }).filter(Boolean);
    let palabras, gana = null;
    if (!ejes.length) palabras = 'Todavía no hay cifras para comparar.';
    else {
      const dif = ejes.filter((x) => x.mejor === 'A' || x.mejor === 'B');
      if (!dif.length) palabras = 'A y B dan lo mismo en ' + ejes.map((x) => x.eje).join(', ').replace(/, ([^,]*)$/, ' y $1') + '.';
      else {
        gana = dif.slice().sort((x, y) => x.e.prio - y.e.prio)[0].mejor;
        const bien = [], mal = [];
        dif.forEach((x) => { if (x.mejor === gana) bien.push(x.e.bien); else mal.push(x.e.mal); });
        const une = (l) => l.join(', ').replace(/, ([^,]*)$/, ' y $1');
        palabras = gana + ' ' + une(bien) + (mal.length ? ', pero ' + une(mal) : '') + '.';
      }
    }
    return { mejor_en: cuenta, rojas, texto, palabras, gana, ejes: ejes.map((x) => ({ eje: x.eje, id: x.id, a: x.a, b: x.b, mejor: x.mejor })) };
  }


  function compara(definicion, plan, escenario, modo) {
    const D = definicion && definicion._interna, errores = [];
    if (!D) return { A: null, B: null, difieren: [], medidas: [], atribucion: [], interaccion: [], aportes: [], causas: [], veredicto: null, errores: [{ codigo: 'id_desconocido', mensaje: 'Definición no válida: llama primero a carga().' }] };
    plan = normalizaPlan(plan);
    if (modo && typeof modo === 'object' && modo.todas_las_opciones) {
      const id = modo.todas_las_opciones, idx = D.ix.get(id);
      if (idx === undefined || D.kind[idx] !== 'nodo' || D.cn[idx].tipo === 'calculado' || !D.cn[idx].opciones.length) {
        return { A: null, B: [], difieren: [], medidas: [], atribucion: [], interaccion: [], aportes: [], causas: [], veredicto: null, errores: [{ codigo: 'id_desconocido', id, mensaje: id + ' no tiene opciones, preajustes ni fuentes que comparar.' }] };
      }
      const c = D.cn[idx], EA = corre(D, plan), lista = [];
      c.opciones.forEach((o) => {
        const r = comparaAB(D, plan, Object.assign({}, escenario && escenario.cambios, { [id]: { opcion: o.clave, estado: 'decidido' } }), errores, EA);
        lista.push({ opcion: o.clave, nombre: o.nombre, resultado: r.B, difieren: r.difieren, medidas: r.medidas, atribucion: r.atribucion, interaccion: r.interaccion, aportes: r.aportes, causas: r.causas, veredicto: r.veredicto });
      });
      return { A: armaResultado(D, EA, null, [], { sugerencias: 'no', rutas: 'no' }, plan, []), B: lista, difieren: [], medidas: [], atribucion: [], interaccion: [], aportes: [], causas: [], veredicto: null, errores };
    }
    return comparaAB(D, plan, (escenario && escenario.cambios) || {}, errores, corre(D, plan));
  }

  /* ═════════════════════════ PAQUETE PARA EL VISOR (ppp2-visor-v1) ═════════════════════════ */
  const CLAVES_V = ['nombre', 'estado', 'que_cambia', 'fecha_aprobacion', 'dueno_aporta', 'dueno_recibe', 'dueno_veces', 'dueno_meses', 'dueno_anos', 'alianza_recibe', 'inversion_recibe', 'ventas', 'costo_sin_tierra', 'tierra', 'obra_inicio', 'fin_obra', 'mes_saldos', 'pagos_obra', 'max_ajeno', 'capital', 'banco_max', 'respaldo', 'costo_dinero', 'rend_capital', 'caja_cierre', 'ganancia', 'margen', 'resultado_repartir', 'banco_mes', 'capital_mes', 'respaldo_mes', 'ultimo_cobro', 'mes_reparto', 'rv_linea_ventas', 'rv_linea_costo', 'rv_aportacion', 'rv_preventa', 'rv_preventa_banco', 'rv_cobertura', 'rv_margen', 'rv_meses_credito', 'rv_falta', 'rv_resultado', 'ck_flujo', 'ck_cobranza', 'ck_unidades', 'capital_sobre_tope', 'fuera_horizonte', 'norma_alertas', 'norma_texto', 'niveles', 'construidos', 'cos_usado', 'cus_usado', 'cajones', 'cajones_pide', 'huella', 'renta_m2', 'renta_tasa', 'renta_anual', 'renta_valor', 'renta_rinde'];
  /* Equivalente en renta (RN-01 a RN-05): solo viaja al visor si el plan escribió una renta (renta anual > 0); sin renta el paquete queda igual que antes. */
  const CLAVES_RENTA = ['renta_m2', 'renta_tasa', 'renta_anual', 'renta_valor', 'renta_rinde'];
  const CLAVES_DATOS = ['terreno.m2', 'tierra.valor', 'lamina.m2_construidos', 'lamina.m2_vendibles', 'cob.enganche', 'din.tasa_capital', 'din.tiie', 'din.sobretasa', 'din.apertura', 'din.caja_pct', 'din.preventa_minima', 'costo.comision'];
  const FILAS_FLUJO = { firmas: 'SUM', enganches: 'SUM', saldos: 'SUM', pagos_obra: 'SUM', cobranza: 'SUM', obra: 'SUM', indirectos: 'SUM', imprevistos: 'SUM', comisiones: 'SUM', cierre: 'SUM', egresos: 'SUM', caja_minima: 'MAX', interes: 'SUM', cap_aporta: 'SUM', cap_acum: 'MAX', apertura: 'SUM', disposicion: 'SUM', respaldo: 'SUM', pago_banco: 'SUM', pago_respaldo: 'SUM', pago_capital: 'SUM', saldo_banco: 'MAX', saldo_capital: 'MAX', saldo_respaldo: 'MAX', caja: 'ULT', flujo_acum: 'ULT', ajeno: 'MAX' };
  const ESTADO_VISOR = { referencia: 'supuesto', no_se: 'por confirmar', decidido: 'decidido', confirmado: 'confirmado', reabierto: 'por confirmar' };

  function paqueteVisor(definicion, plan, opciones) {
    const D = definicion && definicion._interna; opciones = opciones || {};
    if (!D) throw new Error('Definición no válida: llama primero a carga().');
    const plan0 = normalizaPlan(plan), E = corre(D, plan0);
    aplicaReparto(E);   // T-10
    const res = armaResultado(D, E, null, [], { sugerencias: 'no', rutas: 'no' }, plan0, []);
    const v = {}; CLAVES_V.forEach((k) => { v[k] = null; });
    const datos = {}; CLAVES_DATOS.forEach((k) => { datos[k] = { valor: null, estado: 'falta' }; });
    const deducido = {}, avisos = [];
    const tiene = (id) => { const j = D.ix.get(id); return j !== undefined && E.vis[j] === 1 && E.v[j] !== null && E.v[j] !== undefined; };
    const val = (id) => { const j = D.ix.get(id); return tiene(id) ? E.v[j] : null; };
    /* Los meses del árbol, del flujo F-02 y del visor cuentan todos desde 1: no hay conversión de meses (ola 5, M5). */
    const conv = (x, cv) => (!esNum(x) ? x : cv === '/1000000' ? x / 1e6 : x);
    const estadoDe = (id) => { const j = D.ix.get(id), c = D.cn[j]; if (!tiene(id)) return 'falta'; if (c.tipo === 'calculado') return 'derivado'; return ESTADO_VISOR[E.est[j]] || 'supuesto'; };
    const marcaDed = (ruta, id) => { const j = D.ix.get(id), c = D.cn[j]; if (!c || Object.keys(deducido).length >= 400) return; const firme = c.tipo === 'calculado' ? E.firm[j] : (firmeE(E.est[j]) && !valorPropio(E, c)); if (!firme) deducido[ruta] = 'Estimado por el árbol: ' + (c.tipo === 'calculado' ? 'se calcula con ' + (depsDirectas(D, j).map((q) => D.cn[q].titulo).slice(0, 5).join(', ') || c.que_es) : (E.est[j] === 'referencia' ? 'referencia sin confirmar' : E.est[j] === 'no_se' ? '«no sé todavía»' : 'valor de referencia')); };
    D.factores.forEach((f) => {
      if (!f.campoVisor || !tiene(f.id)) return;
      let m; const x = conv(val(f.id), f.conversion); const campo = f.campoVisor.replace(/\s*\(.*\)\s*$/, '');
      if ((m = /^v\.([a-z_0-9]+)$/.exec(campo))) { if (CLAVES_V.indexOf(m[1]) >= 0) { v[m[1]] = x; marcaDed('v.' + m[1], f.id); } }
      else if ((m = /^datos\['([a-z0-9_.]+)'\](\.valor)?$/.exec(campo))) { if (CLAVES_DATOS.indexOf(m[1]) >= 0) { datos[m[1]] = { valor: x, estado: estadoDe(f.id) }; marcaDed("datos['" + m[1] + "']", f.id); } }

    });
    if (!(esNum(v.renta_anual) && v.renta_anual > 0)) CLAVES_RENTA.forEach((k) => { delete v[k]; delete deducido['v.' + k]; });
    /* reparto */
    let reparto = null;
    if (tiene('S-03')) {
      reparto = { numero: null, esquema: 'Árbol PPP (vista previa)', tasa_capital: val('D-01'), paga_tierra: val('S-02'), parte_dueno: val('S-03'), parte_alianza: val('S-04'), parte_capital: val('S-05'), honorarios_pct: val('S-06') };
      Object.keys(reparto).forEach((k) => { if (reparto[k] === undefined) reparto[k] = null; });
    }
    /* productos */
    const productos = [];
    D.tipologias.forEach((i) => {
      const p = { nombre: val('P' + i + '-01'), unidades: val('P' + i + '-09'), m2: val('P' + i + '-10'), precio_m2: val('P' + i + '-06'), ventas: conv(val('P' + i + '-11'), '/1000000'), precio_unidad: conv(val('P' + i + '-12'), '/1000000') };
      if (Object.keys(p).some((k) => p[k] !== null) && productos.length < 6) productos.push(p);
    });
    /* flujo del libro (F-02) */
    const fid = D.tipo.flujoBanco || 'F-02'; let fl = { meses: 0, filas: {}, total: {} }, rflujo = null;
    if (D.flujos[fid]) {
      E.flujo(fid, 'banco_maximo'); const r = E.cacheFlujo[fid];
      if (r && r.ok) {
        const M = r.M; fl.meses = M; rflujo = r;
        Object.keys(FILAS_FLUJO).forEach((k) => {
          const s = r.series[k]; if (!s) return; const esU = k === 'firmas';
          const fila = []; for (let m = 1; m <= M; m++) fila.push(esU ? s[m] : s[m] / 1e6); fl.filas[k] = fila;
          const modo = FILAS_FLUJO[k]; fl.total[k] = modo === 'SUM' ? fila.reduce((a, b) => a + b, 0) : modo === 'MAX' ? Math.max.apply(null, fila) : fila[fila.length - 1];
        });
        const mdp = (x) => (x === null || x === undefined ? null : x / 1e6);
        const med = r.med;
        const pon = (k, x, ruta) => { if (v[k] === null && x !== null && x !== undefined) { v[k] = x; deducido['v.' + k] = ruta; } };
        pon('rend_capital', mdp(med.rendimiento_capital), 'Del flujo F-02: lo que ganó el capital menos lo aportado.');
        pon('respaldo', mdp(med.respaldo_saldo_maximo), 'Del flujo F-02: saldo máximo del respaldo.');
        pon('banco_mes', med.mes_liquidacion_banco, 'Del flujo F-02: mes en que se liquida el banco.');
        pon('mes_saldos', r.ms, 'Del flujo F-02: mes en que se individualizan los saldos.');
        pon('pagos_obra', mdp(med.pagos_durante_obra), 'Del flujo F-02: lo cobrado durante la obra.');
        pon('fuera_horizonte', med.fuera_horizonte, 'Del flujo F-02: unidades que no se firman en 60 meses.');
        pon('ck_flujo', mdp(med.cuadra), 'Del flujo F-02: suma de diferencias de la comprobación de caja (debe ser 0).');
        pon('ck_cobranza', mdp(r.cobranzaTotal - (val('PT-07') || 0)), 'Del flujo F-02: lo cobrado menos las ventas (debe ser 0).');
        const cj = val('E-10'), cq = val('E-11'); if (esNum(cj) && esNum(cq)) pon('cajones', cj + cq, 'Cajones que construye: sótano más a nivel.');
        if (tiene('PT-01')) { pon('ck_unidades', val('PT-01'), 'Unidades del plan.'); }
        if (v.ventas !== null) pon('dueno_aporta', v.tierra, 'Lo que aporta el dueño es su tierra.');
        ['obra', 'indirectos', 'imprevistos', 'comisiones', 'cierre'].forEach((k) => { if (fl.total[k] !== undefined) deducido['flujo.total.' + k] = 'Del flujo F-02, sumado mes a mes.'; });
      }
    }
    /* Cifras del libro que el árbol no tiene como factor pero sale de las suyas con la MISMA definición del libro (ppp2/libro/generar.py:960-1001,
       hoja Versiones). Van marcadas en «deducido»; si falta una pieza, el campo queda vacío (nunca en cero). */
    const ultMes = (k) => { const s = fl.filas[k]; if (!s) return null; for (let m = s.length; m >= 1; m--) if (Math.abs(s[m - 1]) > 0.0005) return m; return null; };
    if (fl.meses) {
      const uc = ultMes('cobranza');
      if (uc !== null) { if (esNum(v.ultimo_cobro) && v.ultimo_cobro !== uc) avisos.push('K-12 dice que el último cobro es el mes ' + v.ultimo_cobro + ' y el flujo F-02 lo cobra en el mes ' + uc + ': el visor recibe el del flujo.'); v.ultimo_cobro = uc; deducido['v.ultimo_cobro'] = 'Del flujo F-02: último mes con cobranza.'; }
      if (v.capital_mes === null) { const m = ultMes('pago_capital'); if (m !== null) { v.capital_mes = m; deducido['v.capital_mes'] = 'Del flujo F-02: último mes en que se paga al capital.'; } }
      if (v.respaldo_mes === null) { const m = ultMes('pago_respaldo'); if (m !== null) { v.respaldo_mes = m; deducido['v.respaldo_mes'] = 'Del flujo F-02: último mes en que se paga el respaldo.'; } }
      if (v.mes_reparto === null) {
        const c = [v.banco_mes, v.capital_mes, v.respaldo_mes, v.ultimo_cobro].filter(esNum);
        if (c.length) { v.mes_reparto = Math.max.apply(null, c); deducido['v.mes_reparto'] = 'Como el libro: el mayor mes entre banco, capital, respaldo y último cobro.'; }
      }
      if (v.dueno_meses === null && esNum(v.mes_reparto)) { v.dueno_meses = v.mes_reparto; v.dueno_anos = v.mes_reparto / 12; deducido['v.dueno_meses'] = 'Igual al mes del reparto, como en el libro.'; deducido['v.dueno_anos'] = 'Meses del reparto entre 12.'; }
    }
    if (v.margen === null && esNum(v.ganancia) && esNum(v.ventas) && v.ventas !== 0) { v.margen = v.ganancia / v.ventas; deducido['v.margen'] = 'Como el libro: ganancia real entre ventas.'; }
    if (v.resultado_repartir === null && esNum(v.caja_cierre) && esNum(v.rend_capital)) { v.resultado_repartir = v.caja_cierre + v.rend_capital; deducido['v.resultado_repartir'] = 'Como el libro: caja al cierre más rendimiento del capital.'; }
    if (datos['tierra.valor'].valor === null && esNum(v.tierra)) { datos['tierra.valor'] = { valor: v.tierra, estado: estadoDe('T-04') }; marcaDed("datos['tierra.valor']", 'T-04'); }
    if (datos['lamina.m2_vendibles'].valor === null && tiene('E-17')) datos['lamina.m2_vendibles'] = { valor: val('E-17'), estado: estadoDe('E-17') };
    /* M4 (ola 5): el visor nunca debe pintar una pérdida engañosa sin aviso. Si el plan se sale del horizonte del flujo o la cobranza no cuadra,
       el paquete lo dice con texto propio, cambia el estado (ya no es «estimado») y recorta a la barra del horizonte los meses que se salen del eje. */
    let alerta = null;
    if (rflujo && fl.meses) {
      const M = fl.meses, med = rflujo.med, razones = [], dinero = (x) => '$' + miles(x / 1e6, 1) + ' M';
      const sale = [];
      if (esNum(med.fuera_horizonte) && med.fuera_horizonte > 0) { sale.push('H'); razones.push(miles(med.fuera_horizonte, 0) + ' de ' + miles(val('PT-01'), 0) + ' unidades no alcanzan a firmarse en los ' + M + ' meses que calcula el visor'); }
      const k12 = val('K-12'), kfin = val('K-07');
      if (esNum(k12) && k12 > M) { sale.push('H'); razones.push('el plan completo dura ' + miles(k12, 0) + ' meses'); }
      if (esNum(kfin) && kfin > M) { sale.push('H'); razones.push('la obra termina en el mes ' + miles(kfin, 0)); }
      const ventas = val('PT-07'), difCob = esNum(ventas) ? rflujo.cobranzaTotal - ventas : 0;
      const cobMal = esNum(ventas) && Math.abs(difCob) > 1;
      if (cobMal) razones.push('lo que se cobra en el flujo (' + dinero(rflujo.cobranzaTotal) + ') no coincide con las ventas del plan (' + dinero(ventas) + ')');
      const cajaMal = esNum(med.cuadra) && med.cuadra > 1;
      if (cajaMal) razones.push('la caja del flujo no cuadra');
      if (razones.length) {
        const horizonte = sale.length > 0;
        const texto = 'Ojo: ' + razones.join('; ') + '. Las cifras de dinero (ganancia o pérdida, banco, capital y reparto) no son confiables con este plan: ' + (horizonte ? 'sube el ritmo de ventas, empieza a vender antes o reduce el tamaño del plan.' : 'revisa los datos de cobranza antes de leerlas.');
        alerta = { codigo: horizonte ? 'fuera_del_horizonte' : 'cobranza_no_cuadra', estado: horizonte ? 'fuera del horizonte' : 'la cobranza no cuadra', texto, razones, horizonte_meses: M, fuera_del_eje: {} };
        if (horizonte) {
          ['obra_inicio', 'fin_obra', 'mes_saldos', 'banco_mes', 'capital_mes', 'respaldo_mes', 'ultimo_cobro', 'mes_reparto', 'dueno_meses'].forEach((k) => { if (esNum(v[k]) && v[k] > M) { alerta.fuera_del_eje[k] = v[k]; v[k] = M; deducido['v.' + k] = 'Recortado al horizonte de ' + M + ' meses del visor (el plan decía ' + miles(alerta.fuera_del_eje[k], 0) + ').'; } });
          if (esNum(v.dueno_meses)) v.dueno_anos = v.dueno_meses / 12;
        }
        avisos.push(texto);
      }
    }
    v.nombre = 'Árbol PPP · vista previa'; v.estado = alerta ? alerta.estado : 'estimado'; v.huella = D.huella;
    if (alerta) deducido['v.estado'] = alerta.texto;
    if (!tiene('RV-11')) v.rv_resultado = res.pruebas.resultado === 'sin revisión para fondos' ? null : res.pruebas.resultado;
    /* ola 6 (decisión C): con umbrales propios el visor no debe presentar el resultado como el del libro */
    const umbralesPropios = res.pruebas.items.filter((p) => p.umbral_propio).map((p) => ({ prueba: p.n, etiqueta: p.etiqueta, umbral: p.umbral, umbral_texto: p.umbral_texto, libro: p.umbral_libro, libro_texto: p.nota.replace(/^umbral propio; el libro pide /, ''), nota: p.nota }));
    if (umbralesPropios.length) {
      const lista = umbralesPropios.map((x) => x.prueba).join(', ').replace(/, ([^,]*)$/, ' y $1');
      if (v.rv_resultado) v.rv_resultado = v.rv_resultado + ' · con umbral propio en ' + (umbralesPropios.length === 1 ? 'la prueba ' : 'las pruebas ') + lista;
      deducido['v.rv_resultado'] = 'No es el resultado del libro: ' + umbralesPropios.map((x) => 'prueba ' + x.prueba + ' con ' + x.umbral_texto + ' (' + x.nota + ')').join('; ') + '.';
    }
    const paso = res.abiertas.length ? (res.nodos.find((n) => n.id === res.abiertas[0]) || {}).pregunta || null : null;
    const paquete = {
      ok: true, esquema: 'ppp2-visor-v1', llave: null, leido: null,
      menu: { plan: 'arbol', planes: [{ id: 'arbol', etiqueta: 'Árbol PPP (vista previa)' }] },
      a_medias: false,   // en el visor significa «el libro se está recalculando»; lo que falta por confirmar va en plan.candados_abiertos
      plan: { nombre: 'Plan del Árbol PPP', ubicacion: null, tipo: D.tipo.id, edad: null, candados_abiertos: res.por_confirmar.n, paso_texto: paso, esquema: 'arbol-ppp', vigente: 1, mostrada: 1 },
      version: 1, versiones: [{ n: 1, nombre: 'Vista previa del árbol', estado: 'borrador' }], v, datos, productos, flujo: fl, reparto,
      candados: [], pruebas: [], pruebas_viejas: [], ultimo: null, cambio: null,
      origen: 'Árbol PPP · estimado, no sincronizado' + (res.por_confirmar.n ? ' · por confirmar: ' + res.por_confirmar.n : ' · todo confirmado') + (alerta ? ' · ATENCIÓN: ' + alerta.estado : ''), deducido
    };
    if (alerta) { paquete.aviso_arbol = alerta; paquete.estado_razon = alerta.texto; }
    paquete.umbrales_propios = umbralesPropios;
    if (umbralesPropios.length) paquete.origen += ' · umbrales propios en ' + (umbralesPropios.length === 1 ? 'la prueba ' : 'las pruebas ') + umbralesPropios.map((x) => x.prueba).join(', ').replace(/, ([^,]*)$/, ' y $1') + ' (distintos de los del libro)';
    paquete.v.resultado_repartir = paquete.v.resultado_repartir === undefined ? null : paquete.v.resultado_repartir;
    empaquetaReparto(E, paquete);   // T-10: cascada, rótulos de los campos del visor y fechas según N-02
    let tam = JSON.stringify(paquete).length;
    if (tam > 50000) { Object.keys(deducido).slice(100).forEach((k) => delete deducido[k]); tam = JSON.stringify(paquete).length; avisos.push('El paquete pasaba de 50,000 caracteres: se recortaron marcas de «deducido».'); }
    if (tam > 50000) avisos.push('El paquete mide ' + tam + ' caracteres y el visor acepta 50,000.');
    if (!opciones.informe) return paquete;
    /* para los adaptadores de conexion/: el valor de TODOS los factores (también los ocultos y los que escribe una opción), en unidades del factor */
    const valores = {};
    D.ids.forEach((id, j) => { valores[id] = { valor: E.v[j] === undefined ? null : E.v[j], estado: E.est[j] || null, visible: E.vis[j] === 1, clase: D.kind[j] }; });
    return { paquete, avisos, caracteres: tam, valores };
  }

  /* ═════════════════════════ MÓDULO DE REPARTOS (SPPP · T-10 · copia de prueba) ═════════════════════════
     El cálculo vive en reparto.js (ArbolReparto); aquí sólo se arma el «caso» con F-02 y los nodos del plan, se leen los parámetros
     S-12, S-13 y S-17 a S-24 y el registro del reparto (plan.reparto: pagos, ISR, demás acreedores, reservas, clases de capital y líneas),
     y se publican R-26 a R-35, la tarjeta «Reparto» y el paquete del visor con sus rótulos. Sólo vertical en venta; renta y el Hub se
     bloquean de forma explícita. Si reparto.js no está cargado, el reparto queda vacío (nunca en cero) y lo dice. */
  /* El motor sigue sin dependencias: en el navegador toma ArbolReparto de la página (reparto.js va antes que motor.js); en Node quien carga
     el motor le pasa el módulo con Motor.registraReparto (ver pruebas/motor-real.cjs). Sin módulo, el reparto queda vacío y lo dice. */
  let REPARTO_MOD = null;
  function moduloReparto() {
    if (REPARTO_MOD) return REPARTO_MOD;
    const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null);
    if (g && g.ArbolReparto && typeof g.ArbolReparto.repartoVertical === 'function') return g.ArbolReparto;
    if (typeof self !== 'undefined' && self && self.ArbolReparto && typeof self.ArbolReparto.repartoVertical === 'function') return self.ArbolReparto;
    return null;
  }
  function registraReparto(mod) {
    if (mod === null) { REPARTO_MOD = null; return false; }
    if (!mod || typeof mod.repartoVertical !== 'function') throw new Error('Módulo de repartos inválido: falta repartoVertical.');
    REPARTO_MOD = mod; return true;
  }
  /* lo que el reparto lee del plan evaluado para armar su caso (R-26 a R-35 se llenan después de evaluar, ver aplicaReparto) */
  const PARAMS_REPARTO = ['S-12', 'S-13', 'S-17', 'S-18', 'S-19', 'S-20', 'S-21', 'S-22', 'S-23', 'S-24'];
  const NODOS_CASO_REPARTO = ['T-04', 'PT-07', 'PT-01', 'D-01', 'D-17', 'D-22', 'S-02', 'S-03', 'S-04', 'S-05', 'S-06', 'R-13', 'R-14', 'R-15', 'R-16', 'R-17', 'R-19', 'R-20', 'R-21', 'R-22', 'R-23', 'R-24', 'R-25', 'RV-06',
    'K-07', 'K-12', 'P1-03', 'C-04', 'C-07', 'C-12', 'C-13', 'C-14', 'C-15', 'C-16', 'C-17', 'C-19', 'D-05', 'D-10', 'D-21', 'E-05'];
  const REPARTO_LEE = NODOS_CASO_REPARTO.concat(PARAMS_REPARTO);
  const MEDIDAS_REPARTO = ['caja_disponible', 'obligaciones', 'reservas', 'caja_repartible', 'utilidad_economica', 'estado', 'fecha_autorizable', 'suma_repartida', 'candados', 'corte'];

  /* Fechas del visor con las MISMAS reglas que paqueteVisor (banco, capital, respaldo, último cobro, mes de reparto y recorte al horizonte).
     Una prueba compara estas fechas con las del paquete en varios planes para que no se separen. */
  function visorFechas(E, r) {
    const D = E.D, M = r.M, med = r.med;
    const val = (id) => { const j = D.ix.get(id); return j !== undefined && E.vis[j] === 1 && E.v[j] !== null && E.v[j] !== undefined ? E.v[j] : null; };
    const ultMes = (k) => { const s = r.series[k]; if (!s) return null; for (let m = M; m >= 1; m--) if (Math.abs(s[m] / 1e6) > 0.0005) return m; return null; };
    const v = { fin_obra: val('K-07'), ultimo_cobro: val('K-12'), banco_mes: med.mes_liquidacion_banco === undefined ? null : med.mes_liquidacion_banco, capital_mes: null, respaldo_mes: null, mes_reparto: null, dueno_meses: null, dueno_anos: null,
      fuera_horizonte: med.fuera_horizonte === undefined ? null : med.fuera_horizonte, horizonte_excedido: false, fuera_del_eje: {} };
    const uc = ultMes('cobranza'); if (uc !== null) v.ultimo_cobro = uc;
    v.capital_mes = ultMes('pago_capital'); v.respaldo_mes = ultMes('pago_respaldo');
    const c = [v.banco_mes, v.capital_mes, v.respaldo_mes, v.ultimo_cobro].filter(esNum);
    if (c.length) v.mes_reparto = Math.max.apply(null, c);
    if (esNum(v.mes_reparto)) { v.dueno_meses = v.mes_reparto; v.dueno_anos = v.mes_reparto / 12; }
    const k12 = val('K-12'), kfin = val('K-07');
    if ((esNum(med.fuera_horizonte) && med.fuera_horizonte > 0) || (esNum(k12) && k12 > M) || (esNum(kfin) && kfin > M)) {
      v.horizonte_excedido = true;
      ['fin_obra', 'banco_mes', 'capital_mes', 'respaldo_mes', 'ultimo_cobro', 'mes_reparto', 'dueno_meses'].forEach((k) => { if (esNum(v[k]) && v[k] > M) { v.fuera_del_eje[k] = v[k]; v[k] = M; } });
      if (esNum(v.dueno_meses)) v.dueno_anos = v.dueno_meses / 12;
    }
    return v;
  }
  function casoReparto(E) {
    const D = E.D, fid = D.tipo.flujoBanco || 'F-02';
    if (!D.flujos[fid]) return null;
    E.flujo(fid, 'banco_maximo'); const r = E.cacheFlujo[fid];
    if (!r || !r.ok) return null;
    const M = r.M, series = {};
    Object.keys(r.series).forEach((k) => { const s = r.series[k], a = [null]; for (let m = 1; m <= M; m++) a.push(s[m]); series[k] = a; });
    const nodos = {}; NODOS_CASO_REPARTO.forEach((id) => { const j = D.ix.get(id); nodos[id] = j === undefined || E.v[j] === undefined ? null : E.v[j]; });
    const r20 = nodos['R-20'], dd22 = nodos['D-22'];
    const rr = esNum(r20) ? r20 / 1e6 : (esNum(dd22) && esNum(r.med.rendimiento_capital) ? (dd22 + r.med.rendimiento_capital) / 1e6 : null);
    return { M, series, nodos, visor: visorFechas(E, r), paquete_v: { resultado_repartir: rr }, tipo: D.tipo.id, tipo_plan: E.plan && E.plan.tipo !== undefined ? E.plan.tipo : null, destino: nodos['P1-03'],
      med: { cuadra: r.med.cuadra, cobranza_total: r.cobranzaTotal, costo_dinero: r.med.costo_dinero, rendimiento_capital: r.med.rendimiento_capital } };
  }
  /* S-18: «ninguno» o «parte=SP; tope=30000000; tasa=0.15; pacto=pactado» (el módulo valida parte registrada, tope, tasa y pacto) */
  function leeFondeador(txt) {
    if (txt === null || txt === undefined) return null;
    const t = String(txt).trim(); if (t === '' || /^ninguno$/i.test(t)) return null;
    if (t.indexOf('=') < 0) return t;   // mal capturado: el módulo lo rechaza
    const o = {}; t.split(';').forEach((par) => { const k = par.split('='); if (k.length < 2) return; const llave = k[0].trim(), x = k.slice(1).join('=').trim(); if (llave === 'parte') o.parte = x; else if (llave === 'tope') o.tope = x === '' ? null : Number(x); else if (llave === 'tasa') o.tasa = x === '' ? null : Number(x); else if (llave === 'pacto') o.estado_pacto = x; else o[llave] = x; });
    return o;
  }
  function leeIva(txt) {   // S-22: «tipología_modalidad», p. ej. vivienda_ya_incorporado
    if (typeof txt !== 'string' || !txt) return null;
    const i = txt.indexOf('_'); return i < 0 ? { tipologia: txt, modalidad: '' } : { tipologia: txt.slice(0, i), modalidad: txt.slice(i + 1) };
  }
  function parametrosReparto(E, caso) {
    const D = E.D, g = (id) => { const j = D.ix.get(id); return j === undefined || E.v[j] === undefined ? null : E.v[j]; };
    const firme = (id) => { const j = D.ix.get(id); return j !== undefined && E.v[j] !== null && E.v[j] !== undefined && firmeE(E.est[j]); };
    const reg = (E.plan && E.plan.reparto) || {};
    const p = {
      mes_corte: g('S-21'), liberar_caja_minima: g('S-17'), fondeador_respaldo: leeFondeador(g('S-18')), prioridad_tierra_pactada: g('S-19') === 'si',
      fee_en_indirectos: firme('S-12') ? g('S-12') : null,      // la referencia no es una declaración: con S-06 > 0 hay que decidir S-12 y S-13
      gestion_esquema: firme('S-13') ? g('S-13') : null,
      imputacion: g('S-20'), iva: leeIva(g('S-22')), estado_pacto_acuerdos: g('S-23'), opcion_reparto: g('S-24')
    };
    ['pagos_registrados', 'isr', 'otros_acreedores', 'reservas', 'clases_capital', 'regla_clases', 'capital_arrastre', 'lineas', 'fechas_pago', 'reparto_interno',
      'preferente_f02', 'comision_venta', 'acuerdos_receptor'].forEach((k) => { if (reg[k] !== undefined) p[k] = clonar(reg[k]); });
    return p;
  }
  function calculaReparto(E) {
    if (!PARAMS_REPARTO.every((id) => E.D.ix.has(id))) return { ok: false, motivo: 'La definición no trae el módulo de repartos (definicion/reparto.json con S-12 a S-24 y R-26 a R-35): el reparto queda vacío y nada se autoriza.' };
    const R = moduloReparto();
    if (!R) return { ok: false, motivo: 'El módulo de repartos (reparto.js) no está cargado: el reparto queda vacío y nada se autoriza.' };
    const caso = casoReparto(E);
    if (!caso) return { ok: false, motivo: 'Sin flujo F-02 completo: el reparto queda vacío.' };
    const parametros = parametrosReparto(E, caso);
    let resultado;
    try { resultado = R.repartoVertical(caso, parametros); } catch (e) { return { ok: false, motivo: 'El reparto falló: ' + e.message }; }
    return { ok: true, caso, parametros, resultado, version: R.VERSION };
  }
  /* R-26 a R-35 son calculados con «motor = reparto.<medida>»: no tienen fórmula y se llenan DESPUÉS de evaluar el plan (evalua, paqueteVisor
     y la API reparto), así no corren en las sugerencias ni en el comparador. Sólo se muestran si su padre está a la vista y la medida existe. */
  function aplicaReparto(E) {
    const D = E.D, nodos = D.cn.filter((c) => c.tipo === 'calculado' && c.motor && c.motor.indexOf('reparto.') === 0);
    if (!nodos.length) return;
    if (E.cacheReparto === undefined) E.cacheReparto = calculaReparto(E);
    nodos.forEach((c) => {
      const i = c.i, pj = D.ix.get(c.de);
      if (pj !== undefined && (!E.vis[pj] || E.v[pj] === null)) return;
      const x = medidaReparto(E.cacheReparto, c.motor.slice(8));
      if (x === null || x === undefined) return;
      E.v[i] = x; E.vis[i] = 1; E.firm[i] = false;
    });
  }
  function medidaReparto(rr, medida) {
    if (!rr || !rr.ok) return medida === 'estado' ? 'SIN CALCULAR · ' + ((rr && rr.motivo) || 'sin datos') : null;
    const x = rr.resultado, calculado = !!x.salida;
    const sumaV = (o) => Object.keys(o || {}).reduce((s, k) => s + o[k], 0);
    switch (medida) {
      case 'estado': return x.estado;
      case 'candados': { const cods = []; (x.motivos || []).forEach((m) => { const c = m.split(' · ')[0]; if (cods.indexOf(c) < 0) cods.push(c); }); (x.motivos_utilidades || []).forEach((m) => { const c = m.split(' · ')[0] + ' (utilidades)'; if (cods.indexOf(c) < 0) cods.push(c); }); return cods.length ? cods.join(' · ') : 'ninguno'; }
      case 'corte': return calculado ? x.corte + ' · corte en el mes ' + x.mes_corte + (x.primer_mes_cierre !== null ? ' · primer mes de cierre ' + x.primer_mes_cierre : ' · sin cierre en el horizonte') : null;
      case 'fecha_autorizable': return calculado ? x.fecha_autorizable : null;
      default: break;
    }
    if (!calculado) return null;   // inválido o fuera de alcance: vacío, nunca cero
    if (medida === 'caja_disponible') return x.cd;
    if (medida === 'obligaciones') return x.obligaciones;
    if (medida === 'reservas') return x.reservas_requeridas;
    if (medida === 'caja_repartible') return x.cr;
    if (medida === 'utilidad_economica') return x.utilidad_economica;
    if (medida === 'suma_repartida') return sumaV(x.simulado);
    return null;
  }
  const textoRotulo = (x) => (!x ? null : x.estado === 'publicable' ? 'publicable' : 'teórico, sin autorización de pago · ' + x.motivos.join('; '));
  /* Bloque compacto de la cascada para la tarjeta y el paquete (mismo contenido en los dos) */
  function bloqueCascada(rr) {
    if (!rr || !rr.ok) return { ok: false, estado: 'SIN CALCULAR', motivo: rr ? rr.motivo : 'sin datos', motivos: [rr ? rr.motivo : 'sin datos'] };
    const x = rr.resultado, sumaV = (o) => Object.keys(o || {}).reduce((s, k) => s + o[k], 0), R = moduloReparto();
    const b = { ok: true, version: rr.version, estado: x.estado, opcion_reparto: x.opcion_reparto, opcion_titulo: x.opcion_titulo || null, motivos: x.motivos, motivos_utilidades: x.motivos_utilidades || [],
      no_implementado: x.no_implementado, alcance: 'vertical en venta (copia de prueba T-10); renta y el Hub quedan fuera y se bloquean',
      /* O02 (T-11): el estado de cada dato de las fichas (vertical y Hub, C2 del dictamen T-09 v2) se entrega al lector en la tarjeta y el paquete */
      fichas: R && R.FICHAS ? { filas: R.FICHAS.map((f) => [f.id, f.dato, f.estado_vertical, f.estado_hub]), regla: 'el Hub nunca supera al vertical', fallas: R.validaEstadosHub() } : null };
    if (!x.salida) {
      /* sin salida (inválido o fuera de alcance): el hito del motor se informa como referencia; no hay corte autorizado ni pago */
      const hito = rr.caso && rr.caso.visor && esNum(rr.caso.visor.mes_reparto) ? rr.caso.visor.mes_reparto : null;
      b.fechas = { hito_motor: { valor: hito, estado: 'teórico', rol: 'hito del motor', fuente: 'motor (hito del Árbol)', motivos: ['referencia del Árbol (hito del motor), no es fecha autorizada'] },
        corte_autorizado: { valor: null, estado: 'teórico', rol: 'corte autorizado', fuente: 'corte del reparto (S-21)', motivos: [x.estado] }, pago_registrado: { valor: null, estado: 'sin registro', rol: 'pago registrado', fuente: 'libro de pagos (fuera del Árbol)', motivos: ['sin pago registrado'] } };
      return b;
    }
    const pq = x.salida.paquete, f = (k) => (pq[k] ? Object.assign({ valor: pq[k].valor, estado: pq[k].estado, rol: pq[k].rol || null, fuente: pq[k].fuente, motivos: pq[k].motivos }, pq[k].fecha_sin_importe !== undefined ? { fecha_sin_importe: pq[k].fecha_sin_importe } : {}) : null);   // N01 (T-11 v2): la fecha sin importe viaja aparte, nunca como valor
    return Object.assign(b, {
      corte: x.corte, mes_corte: x.mes_corte, primer_mes_cierre: x.primer_mes_cierre, cartera_por_cobrar: x.cartera_por_cobrar, egresos_pendientes: x.egresos_pendientes,
      caja_disponible: x.cd, acreedores: x.acreedores, reservas: [x.reserva].concat(x.reservas_otras || []), caja_repartible: x.cr,
      totales: { simulado: sumaV(x.simulado), autorizado: sumaV(x.autorizado), pagado: sumaV(x.pagado) },
      por_parte: { DUENO: x.dueno, ALIANZA: x.alianza, CAPITAL: x.capital_cascada }, alianza_por_socio: x.alianza_por_socio, conciliacion: x.conciliacion,
      fechas: { hito_motor: f('mes_reparto'), corte_autorizado: f('fecha_corte_autorizado'), dueno_meses: f('dueno_meses'), dueno_anos: f('dueno_anos'), pago_registrado: f('fecha_pago_registrado') },
      campos: Object.keys(pq).reduce((o, k) => { o[k] = { valor: pq[k].valor, estado: pq[k].estado, fuente: pq[k].fuente, rotulo: textoRotulo(pq[k]) || pq[k].estado }; return o; }, {}),
      legado: Object.keys(x.salida.legado).reduce((o, k) => { o[k] = { valor: x.salida.legado[k].valor, estado: x.salida.legado[k].estado, motivo: x.salida.legado[k].motivos.join('; ') }; return o; }, {}),
      reconciliado: x.salida.reconciliado, notas: x.notas, capital: { principal_pendiente: x.principal_pendiente, preferente_pendiente: x.preferente_pendiente, por_clase: x.capital_por_clase, capitalizacion: x.capitalizacion },
      lineas: x.lineas || []
    });
  }
  /* tarjeta «Reparto»: cada cifra lleva su rótulo (publicable o «teórico, sin autorización de pago» con motivos: pérdida asignada, tierra
     aportada sin regla pactada, corte no autorizable). Con tierra en especie y pacto, la tarjeta publica la cascada pactada reconciliada
     y guarda el valor del motor como legado teórico (B3). */
  const tieneExtension = (D) => PARAMS_REPARTO.every((id) => D.ix.has(id));
  function rotulaTarjetaReparto(E, tarjeta) {
    if (!tieneExtension(E.D)) return;   // O01 (T-11): sin la extensión, la tarjeta queda idéntica a la del commit base
    if (E.cacheReparto === undefined) E.cacheReparto = calculaReparto(E);
    const rr = E.cacheReparto;
    tarjeta.cascada = bloqueCascada(rr);
    if (!rr || !rr.ok || !rr.resultado.salida) { tarjeta.cifras.forEach((c) => { if (['R-22', 'R-23', 'R-24', 'R-25'].indexOf(c.id) >= 0) { c.estado_reparto = 'teórico'; c.rotulo = 'teórico, sin autorización de pago · ' + (rr && rr.ok ? rr.resultado.estado + ' · ' + rr.resultado.motivos.slice(0, 2).join('; ') : (rr ? rr.motivo : 'sin reparto')); if (esNum(c.valor) && c.valor < 0) c.etiqueta_reparto = 'Pérdida asignada (teórica) · ' + c.etiqueta; } }); return; }
    const t = rr.resultado.salida.tarjeta;
    tarjeta.cifras.forEach((c) => {
      const x = t[c.id]; if (!x) return;
      c.estado_reparto = x.estado; c.fuente_reparto = x.fuente; c.rotulo = textoRotulo(x);
      if (esNum(x.valor) && x.valor < 0) c.etiqueta_reparto = 'Pérdida asignada (teórica) · ' + c.etiqueta;
      if (x.fuente === 'cascada pactada reconciliada' && !igualV(x.valor, c.valor)) { const fz = E.D.factores.find((q) => q.id === c.id); c.legado = { valor: c.valor, valor_visor: c.valor_visor, estado: 'teórico', motivo: 'legado del motor sin la prioridad pactada de la tierra' }; c.valor = x.valor; c.valor_visor = fz && fz.conversion === '/1000000' ? x.valor / 1e6 : x.valor; }
    });
  }
  /* paquete del visor: bloque «cascada», rótulos en «deducido» y fechas según N-02 (hito del motor, corte autorizado y pago registrado) */
  function empaquetaReparto(E, paquete) {
    if (!tieneExtension(E.D)) return;   // O01 (T-11): sin la extensión, el paquete queda idéntico al del commit base
    if (E.cacheReparto === undefined) E.cacheReparto = calculaReparto(E);
    const rr = E.cacheReparto, v = paquete.v, ded = paquete.deducido;
    paquete.cascada = bloqueCascada(rr);
    const nota = (k, txt) => { ded['v.' + k] = (ded['v.' + k] ? ded['v.' + k] + ' · ' : '') + txt; };
    if (!rr || !rr.ok || !rr.resultado.salida) {
      /* B04 (T-11): con datos inválidos, fuera de alcance o sin módulo, el bloqueo se conserva en lo que lee el visor: ninguna cifra es pago */
      const por = rr && rr.ok ? rr.resultado.estado + ': ' + rr.resultado.motivos.slice(0, 2).join('; ') : 'SIN CALCULAR: ' + (rr ? rr.motivo : 'sin datos');
      ['dueno_recibe', 'alianza_recibe', 'inversion_recibe', 'dueno_veces'].forEach((k) => { if (k in v) nota(k, 'Reparto ' + por + ' · cifra teórica del motor, sin autorización de pago' + (esNum(v[k]) && v[k] < 0 ? ' · se muestra como «pérdida asignada (teórica)», nunca bajo «recibe»' : '')); });
      if ('mes_reparto' in v) nota('mes_reparto', 'Hito del motor (referencia del Árbol); sin corte autorizado: reparto ' + por + '.');
      ['dueno_meses', 'dueno_anos'].forEach((k) => { if (k in v) nota(k, 'Referencia del Árbol (hito del motor), no es fecha autorizada: reparto ' + por + '.'); });
      return;
    }
    const pq = rr.resultado.salida.paquete;
    Object.keys(rr.resultado.salida.paquete).forEach((k) => {
      const x = pq[k]; if (!(k in v) || !x) return;
      if (['dueno_recibe', 'alianza_recibe', 'inversion_recibe', 'dueno_veces'].indexOf(k) >= 0) {
        if (x.fuente === 'cascada pactada reconciliada') { const nuevo = k === 'dueno_veces' ? x.valor : x.valor / 1e6; if (!igualV(nuevo, v[k])) { nota(k, 'Cascada pactada reconciliada (T-10); el motor dice ' + miles(v[k], k === 'dueno_veces' ? 3 : 2) + ' sin la prioridad pactada de la tierra (legado, teórico).'); v[k] = nuevo; } }
        nota(k, 'Reparto: ' + (x.estado === 'publicable' ? 'publicable' : textoRotulo(x)) + (esNum(x.valor) && x.valor < 0 ? ' · se muestra como «pérdida asignada (teórica)», nunca bajo «recibe»' : ''));
      }
    });
    /* N-02: el mes de reparto del motor es el hito del Árbol; nunca se presenta como fecha autorizada de otro corte */
    nota('mes_reparto', 'Hito del motor (referencia del Árbol): ' + (pq.mes_reparto.estado === 'publicable' ? 'coincide con el corte autorizado.' : textoRotulo(pq.mes_reparto) + '.') + (pq.fecha_corte_autorizado.valor !== null ? ' Corte autorizado: mes ' + pq.fecha_corte_autorizado.valor + '.' : ' Sin corte autorizado.'));
    if (pq.fecha_corte_autorizado.valor !== null) {
      if (!igualV(v.dueno_meses, pq.dueno_meses.valor)) { nota('dueno_meses', 'Corte autorizado (S-21): mes ' + pq.dueno_meses.valor + '; el hito del motor era ' + v.dueno_meses + '.'); v.dueno_meses = pq.dueno_meses.valor; }
      if (!igualV(v.dueno_anos, pq.dueno_anos.valor)) { nota('dueno_anos', 'Corte autorizado (S-21) entre 12; el hito del motor era ' + miles(v.dueno_anos, 2) + '.'); v.dueno_anos = pq.dueno_anos.valor; }
    } else { nota('dueno_meses', 'Referencia del Árbol (hito del motor): ' + textoRotulo(pq.dueno_meses) + '.'); nota('dueno_anos', 'Referencia del Árbol (hito del motor): teórico, sin autorización de pago.'); }
  }
  /* API: el reparto de un plan (caso armado con F-02, parámetros leídos del plan y resultado del módulo) */
  function reparto(definicion, plan) {
    const D = definicion && definicion._interna;
    if (!D) return { ok: false, motivo: 'Definición no válida: llama primero a carga().' };
    const E = corre(D, normalizaPlan(plan));
    aplicaReparto(E);
    if (E.cacheReparto === undefined) E.cacheReparto = calculaReparto(E);
    const rr = E.cacheReparto, nodos = {};
    D.cn.forEach((c) => { if (c.motor && c.motor.indexOf('reparto.') === 0) nodos[c.id] = E.vis[c.i] ? E.v[c.i] : null; });
    return Object.assign({}, rr, { bloque: bloqueCascada(rr), nodos });
  }
  /* B01 (T-11): aplica al plan la estructura de una opción de P-02 (S-24, S-03, S-05 y D-01) y lo vuelve a evaluar: F-02 se recalcula con el
     rendimiento de la opción y la tarjeta usa su excedente. El preferente simple que pactan las opciones no lo cambia esto (F-02 capitaliza cada mes). */
  function planConOpcion(definicion, plan, opcion) {
    const D = definicion && definicion._interna;
    if (!D) throw new Error('Definición no válida: llama primero a carga().');
    if (!tieneExtension(D)) throw new Error('La definición no trae el módulo de repartos (definicion/reparto.json).');
    const R = moduloReparto(); if (!R) throw new Error('El módulo de repartos (reparto.js) no está cargado.');
    if (!Object.prototype.hasOwnProperty.call(R.OPCIONES, opcion)) throw new Error('Opción de P-02 desconocida: ' + opcion + ' (A, B o C).');
    const op = R.OPCIONES[opcion], cambios = [['S-24', opcion], ['S-03', op.excedente.DUENO], ['S-05', op.excedente.CAPITAL], ['D-01', op.preferente.tasa]];
    let p = plan; const errores = [];
    cambios.forEach(([id, valor]) => {
      /* un nodo con opciones (S-03: «Tierra + 30 %», «Tierra + mitad»…) se decide por la opción que vale exactamente lo de P-02; si no la hay, se reporta */
      const j = D.ix.get(id), c = j === undefined ? null : D.cn[j], ops = c && Array.isArray(c.opciones) ? c.opciones : [];
      const vOp = (x) => (typeof x.valor === 'number' ? x.valor : x.valor && x.valor.base && x.valor.base.ast && x.valor.base.ast.t === 'num' ? x.valor.base.ast.v : null);
      const o = typeof valor === 'number' ? ops.find((x) => vOp(x) !== null && Math.abs(vOp(x) - valor) < 1e-12) : null;
      const cambio = o ? { opcion: o.clave, estado: 'decidido' } : { valor, estado: 'decidido' };
      const r = evalua(definicion, p, { [id]: cambio }, { sugerencias: 'no', rutas: 'no' }); (r.errores || []).forEach((e) => errores.push(e)); p = r.plan;
    });
    if (plan && plan.reparto !== undefined) p = Object.assign({}, p, { reparto: clonar(plan.reparto) });
    return { plan: p, errores, opcion, estructura: { excedente: Object.assign({}, op.excedente), preferente: Object.assign({}, op.preferente) } };
  }
  function extiende(entrada, ext) { const errores = []; const out = extiendeDefinicion(entrada, ext, errores); return { definicion: out, errores }; }
  function visorFechasPublica(definicion, plan) {
    const D = definicion && definicion._interna; if (!D) return null;
    const E = corre(D, normalizaPlan(plan)), fid = D.tipo.flujoBanco || 'F-02';
    if (!D.flujos[fid]) return null; E.flujo(fid, 'banco_maximo'); const r = E.cacheFlujo[fid];
    return r && r.ok ? visorFechas(E, r) : null;
  }

  /* ═════════════════════════ API PÚBLICA ═════════════════════════ */
  function sinFilas(o) { return JSON.parse(JSON.stringify(o, (k, x) => (k.charAt(0) === '_' ? undefined : x))); }

  function construye(cr, comp) {
    const D = comp, N = D.N;
    D.firmDeps = D.deps.map((l) => l.filter((d) => ['formula', 'escribe', 'flujo', 'componente', 'efecto'].indexOf(d.tipo) >= 0).map((d) => d.j));
    D.sal = []; for (let i = 0; i < N; i++) D.sal.push([]);
    D.deps.forEach((l, i) => l.forEach((d) => { if (d.tipo !== 'de') D.sal[d.j].push({ a: i, tipo: d.tipo }); }));
    D.huella = huella53(canonico(sinFilas({ tipo: cr.tipo, nodos: cr.nodos, componentes: cr.componentes, factores: cr.factores, flujos: cr.flujos, listas: cr.listas })));
    return D;
  }

  function carga(entrada, opciones) {
    const errores = [], avisos = [];
    if (opciones && opciones.extension) { entrada = extiendeDefinicion(entrada, opciones.extension, errores); if (errores.length) return { definicion: null, huella: null, errores, advertencias: avisos }; }
    const cr = normalizaEntrada(entrada, errores);
    if (!cr) return { definicion: null, huella: null, errores, advertencias: avisos };
    let comp = null;
    try { comp = compilaDefinicion(cr, errores, avisos); } catch (e) { errores.push({ pestana: 'ARBOL_NODOS', fila: 0, columna: '', codigo: 'error_interno', mensaje: 'No se pudo compilar la definición: ' + e.message }); }
    if (errores.length || !comp) return { definicion: null, huella: null, errores, advertencias: avisos };
    const D = construye(cr, comp);
    const definicion = { version: D.tipo.version, huella: D.huella, tipo: D.tipo.id, nombre: D.tipo.nombre, nodos: D.cn.map((c) => c.id), _interna: D };
    /* copia de lo que se cargó (para editaDefinicion); no se enumera, así no viaja si la definición se serializa */
    try { Object.defineProperty(definicion, '_fuente', { value: typeof entrada === 'string' ? JSON.parse(entrada) : clonar(entrada), enumerable: false }); } catch (e) { /* sin copia: editaDefinicion pedirá la definición original */ }
    return { definicion, huella: D.huella, errores: [], advertencias: avisos };
  }
  function valida(entrada) { const r = carga(entrada); return { ok: r.errores.length === 0, errores: r.errores, advertencias: r.advertencias, huella: r.huella }; }

  function erroresDeEstado(E) {
    const out = [];
    E.reabiertas.forEach((r) => out.push({ codigo: E.D.cn[r.i].fuentes ? 'fuente_no_disponible' : 'opcion_no_disponible', id: r.id, mensaje: r.motivo }));
    const t1 = E.D.ix.get('T-01');
    if (t1 !== undefined && E.D.kind[t1] === 'nodo' && E.vis[t1] && esNum(E.v[t1]) && E.v[t1] <= 0) out.push({ codigo: 'fuera_de_rango', id: 'T-01', mensaje: 'El predio debe medir más de 0 m²: con ' + E.v[t1] + ' m² no hay plan que calcular.' });
    return out;
  }
  function evalua(definicion, plan, cambio, opciones) {
    const D = definicion && definicion._interna;
    if (!D) return { rotulo: ROTULO, nodos: [], abiertas: [], errores: [{ codigo: 'id_desconocido', mensaje: 'Definición no válida: llama primero a carga().' }] };
    const p0 = normalizaPlan(plan), errores = [], hay = cambio && Object.keys(cambio).length > 0;
    const Ea = hay ? corre(D, p0) : null;
    const plan2 = hay ? aplicaCambio(D, Ea, p0, cambio, errores) : p0;
    const E = corre(D, plan2);
    if (Ea) aplicaReparto(Ea); aplicaReparto(E);   // T-10: R-26 a R-35 (módulo de repartos) después de evaluar
    erroresDeEstado(E).forEach((e) => errores.push(e));
    if (E.sinConverger) errores.push({ codigo: 'ciclo_de_reglas', mensaje: 'Las reglas no se estabilizaron (ciclo de reglas): revise las condiciones de aparición.' });
    return armaResultado(D, E, Ea, errores, opciones, plan2, hay ? Object.keys(cambio).filter((k) => k !== '@contexto') : []);
  }
  function sugiere(definicion, plan, alertaId, cambio) {
    const D = definicion && definicion._interna;
    if (!D) return { alerta_id: alertaId, estado: 'sin_palancas', sugerencias: [], no_mostradas: 0, omitidas: [], errores: [{ codigo: 'id_desconocido', mensaje: 'Definición no válida: llama primero a carga().' }] };
    const p0 = normalizaPlan(plan), errores = [], hay = cambio && Object.keys(cambio).length > 0;
    const E0 = corre(D, p0), plan2 = hay ? aplicaCambio(D, E0, p0, cambio, errores) : p0, E = hay ? corre(D, plan2) : E0;
    let al = null; D.cn.forEach((c) => c.alertas.forEach((a) => { if (a.id === alertaId) al = a; }));
    if (!al) { errores.push({ codigo: 'id_desconocido', id: alertaId, mensaje: 'No existe la alerta «' + alertaId + '».' }); return { alerta_id: alertaId, estado: 'sin_palancas', sugerencias: [], no_mostradas: 0, omitidas: [], errores }; }
    const r = sugiereAlerta(D, E, plan2, al, errores);
    return { alerta_id: alertaId, estado: r.estado, sugerencias: r.sugerencias, no_mostradas: r.no_mostradas, omitidas: r.omitidas, mensaje: r.mensaje, errores };
  }
  function planConCambio(definicion, plan, cambio) {
    const D = definicion && definicion._interna; if (!D) return { plan: null, errores: [{ codigo: 'id_desconocido', mensaje: 'Definición no válida.' }] };
    const p0 = normalizaPlan(plan), errores = [], E0 = corre(D, p0), plan2 = aplicaCambio(D, E0, p0, cambio || {}, errores), E = corre(D, plan2);
    return { plan: planResultante(D, E, plan2), errores };
  }
  /* para el editor: revisar una expresión suelta */
  function analiza(texto) {
    try {
      const ast = parsea(texto); const an = analizaAst(ast);
      /* los mismos límites que aplica carga (D7 4.1): lo que analiza acepta, carga lo acepta */
      if (an.ids.size > MAX_SIMB) return { ok: false, mensaje: 'La expresión usa ' + an.ids.size + ' IDs distintos y el máximo es ' + MAX_SIMB + '.' };
      if (an.prof > MAX_PROF) return { ok: false, mensaje: 'La expresión está anidada ' + an.prof + ' niveles y el máximo es ' + MAX_PROF + ': pártala en dos nodos calculados.' };
      return { ok: true, ids: Array.from(an.ids), funciones: Array.from(an.funcs), flujos: Array.from(an.flujos), profundidad: an.prof };
    } catch (e) { if (e.expr) return { ok: false, mensaje: e.message }; throw e; }
  }
  /* evalúa una expresión con valores sueltos {ID: valor}; sin estados ni campos especiales; sirve para probar la gramática */
  function evaluaExpresion(texto, valores) {
    const ast = parsea(texto), ix = new Map(), v = [];
    Object.keys(valores || {}).forEach((id) => { ix.set(id, v.length); v.push(valores[id]); });
    const C = { ix, faltan: new Set(), tipologias: () => [] };
    const f = compila(ast, C);
    return f({ v, est: [], opc: [], rf: [], mn: [], mx: [] });
  }

  /* ═════════════════════════ EDITOR DE REGLAS: editaDefinicion ═════════════════════════
     Aplica una lista de cambios a la definición (sin mutar la original), valida con carga y dice qué filas de qué
     pestaña ARBOL_* hay que escribir. Solo columnas de DATOS; la estructura (id, tipo, fórmulas, condiciones) se rechaza. */
  const MOTIVO_ESTRUCTURA = 'define la estructura del árbol (IDs, tipos, fórmulas, condiciones o enlaces), no un dato: el editor solo cambia títulos, textos, opciones, valores, rangos, referencias, umbrales y componentes. Un cambio de estructura lo hace Dirección sobre la definición.';
  const EDITABLES = {
    ARBOL_NODOS: ['titulo', 'que_es', 'pregunta', 'etiqueta_resultado', 'confirma_en', 'mercado_dato', 'unidad_etiqueta', 'referencia_valor', 'referencia_opcion', 'referencia_origen', 'rango_min', 'rango_max', 'rango_paso', 'umbral'],
    ARBOL_OPCIONES: ['nombre', 'implica', 'valor', 'orden', 'componentes', 'fuente', 'fecha_fuente', 'por_omision'],
    ARBOL_COMPONENTES: ['nombre', 'cantidad', 'm2_por_unidad', 'min', 'max', 'paso', 'activo_ref', 'fuente', 'nota', 'orden'],
    ARBOL_REGLAS: ['texto', 'texto_sugerencia', 'texto_cierre', 'meta'],
    ARBOL_FACTORES: ['nombre', 'etiqueta_corta', 'nota'],
    ARBOL_TIPOS: ['nombre', 'max_abiertas', 'max_sugerencias', 'tope_corridas', 'tope_ms'],
    ARBOL_LISTAS: ['nombre']
  };
  const ALTA_OPCION = ['nodo', 'clave', 'nombre', 'implica', 'valor', 'orden', 'componentes', 'fuente', 'fecha_fuente', 'por_omision'];
  const ALTA_COMPONENTE = ['nodo', 'clave', 'nombre', 'rol', 'unidad_base', 'cantidad', 'm2_por_unidad', 'base', 'min', 'max', 'paso', 'activo_ref', 'fuente', 'nota', 'orden', 'version'];

  function editaDefinicion(definicion, cambios) {
    const errores = [], filas = {}, vacio = (extra) => Object.assign({ ok: false, definicion: null, errores, filas_cambiadas: {}, advertencias: [], huella_antes: null, huella_despues: null }, extra || {});
    const err = (pestana, fila, columna, codigo, mensaje) => errores.push({ pestana, fila: fila === undefined || fila === null ? 0 : fila, columna: columna || '', codigo, mensaje });
    /* 1 · la fuente: la definición cargada (guarda su copia), o la definición original (JSON o pestañas) */
    let fuente = null, huellaAntes = null;
    if (definicion && definicion._interna) { fuente = definicion._fuente ? clonar(definicion._fuente) : null; huellaAntes = definicion.huella; }
    else if (typeof definicion === 'string') { try { fuente = JSON.parse(definicion); } catch (e) { fuente = null; } }
    else if (definicion && typeof definicion === 'object') fuente = clonar(definicion);
    if (!fuente) { err('ARBOL_NODOS', 0, '', 'sin_definicion', 'No tengo la definición original para editar: pase la definición tal como se cargó (JSON o pestañas ARBOL_*) o la que devolvió carga().'); return vacio(); }
    if (!Array.isArray(cambios)) { err('ARBOL_NODOS', 0, '', 'cambios_invalidos', 'Los cambios deben venir como una lista.'); return vacio(); }
    const e0 = [];
    const cr = normalizaEntrada(fuente, e0);
    if (!cr) { e0.forEach((e) => errores.push(e)); return vacio(); }
    if (huellaAntes === null) { const r0 = carga(clonar(fuente)); huellaAntes = r0.huella; }
    const nota = (tabla, accion, clave, fila, columnas) => {
      const lista = filas[tabla] || (filas[tabla] = []);
      let f = accion === 'cambia' ? lista.find((q) => q.accion === 'cambia' && canonico(q.clave) === canonico(clave)) : null;
      if (!f) { f = { accion, clave, fila: fila === undefined ? null : fila, columnas: {} }; lista.push(f); }
      Object.assign(f.columnas, columnas || {});
    };
    /* Ola 6 (G3): un texto que empieza con = + - @ se vuelve fórmula al pegarlo en una hoja de cálculo. Se rechaza en palabras; los números escritos como texto («-0.5») sí pasan. */
    const abreFormula = (v) => typeof v === 'string' && /^\s*[=+\-@]/.test(v) && !/^\s*[-+]?\d+([.,]\d+)?\s*%?\s*$/.test(v);
    const MENSAJE_FORMULA = (pos, col) => pos + ': el texto de «' + col + '» empieza con = + - o @, y al pegarlo en una hoja de cálculo se volvería una fórmula. Escríbelo de otra forma (por ejemplo, sin ese signo al principio).';
    const textoOk = (v) => typeof v === 'string' || (typeof v === 'number' && isFinite(v)) || typeof v === 'boolean' || v === null;
    const nodoPorId = (id) => cr.nodos.find((n) => n.id === id);
    const filaDe = (x, lista) => (x && x._fila) || lista.indexOf(x) + 2;

    cambios.forEach((ch, q) => {
      const pos = 'El cambio ' + (q + 1);
      if (!ch || typeof ch !== 'object') { err('ARBOL_NODOS', 0, '', 'cambio_invalido', pos + ' no es un objeto {tabla, id, columna, valor}.'); return; }
      const tabla = String(ch.tabla || '').toUpperCase(), accion = String(ch.accion || 'cambia').toLowerCase();
      if (!EDITABLES[tabla] && tabla !== 'ARBOL_FLUJOS') { err(ch.tabla || 'ARBOL_NODOS', 0, '', 'tabla_desconocida', pos + ': la pestaña «' + ch.tabla + '» no existe o no se puede editar.'); return; }
      if (tabla === 'ARBOL_FLUJOS') { err(tabla, 0, ch.columna || '', 'estructura_no_editable', pos + ': la pestaña ARBOL_FLUJOS ' + MOTIVO_ESTRUCTURA); return; }
      if (['cambia', 'alta', 'baja'].indexOf(accion) < 0) { err(tabla, 0, '', 'cambio_invalido', pos + ': la acción «' + ch.accion + '» no existe (cambia, alta o baja).'); return; }

      /* altas y bajas: solo opciones y componentes del catálogo */
      if (accion !== 'cambia') {
        if (tabla !== 'ARBOL_OPCIONES' && tabla !== 'ARBOL_COMPONENTES') { err(tabla, 0, '', 'estructura_no_editable', pos + ': en ' + tabla + ' no se dan de alta ni de baja filas: ' + MOTIVO_ESTRUCTURA.replace(/^define/, 'cambiaría lo que define')); return; }
        const esOp = tabla === 'ARBOL_OPCIONES', permit = esOp ? ALTA_OPCION : ALTA_COMPONENTE;
        const fila0 = accion === 'alta' ? ch.fila : ch;
        if (accion === 'alta' && (!fila0 || typeof fila0 !== 'object')) { err(tabla, 0, '', 'cambio_invalido', pos + ': el alta necesita «fila» con los datos de la fila nueva.'); return; }
        const nodoId = String(fila0.nodo || ''), clave = String(fila0.clave || '');
        const n = nodoPorId(nodoId);
        if (!n) { err(tabla, 0, 'nodo', 'id_inexistente', pos + ': el nodo «' + nodoId + '» no existe.'); return; }
        if (!clave) { err(tabla, 0, 'clave', 'campo_obligatorio', pos + ': falta la clave.'); return; }
        if (accion === 'alta') {
          Object.keys(fila0).forEach((c) => { if (permit.indexOf(c) < 0) err(tabla, 0, c, COLUMNAS[tabla].indexOf(c) < 0 ? 'columna_desconocida' : 'estructura_no_editable', COLUMNAS[tabla].indexOf(c) < 0 ? pos + ': la columna «' + c + '» no existe en ' + tabla + '.' : pos + ': la columna «' + c + '» de ' + tabla + ' ' + MOTIVO_ESTRUCTURA); });
          Object.keys(fila0).forEach((c) => { if (permit.indexOf(c) >= 0 && !textoOk(fila0[c])) err(tabla, 0, c, 'valor_invalido', pos + ': el valor de «' + c + '» debe ser un texto o un número.'); });
          Object.keys(fila0).forEach((c) => { if (permit.indexOf(c) >= 0 && abreFormula(fila0[c])) err(tabla, 0, c, 'texto_con_formula', MENSAJE_FORMULA(pos, c)); });
          if (esOp) {
            if (n.opciones.some((o) => o.clave === clave)) { err(tabla, 0, 'clave', 'clave_duplicada', pos + ': la opción «' + clave + '» ya existe en ' + nodoId + '.'); return; }
            if (!T(fila0.nombre)) { err(tabla, 0, 'nombre', 'campo_obligatorio', pos + ': la opción necesita nombre.'); return; }
            if (errores.length && errores.some((e) => /^El cambio/.test(e.mensaje) && e.mensaje.indexOf(pos + ':') === 0)) return;
            const orden = fila0.orden !== undefined && T(fila0.orden) !== '' ? ENTERO(fila0.orden) : (n.opciones.reduce((m, o) => Math.max(m, o.orden || 0), 0) + 1);
            n.opciones.push({ clave, nombre: T(fila0.nombre), implica: T(fila0.implica), valor: T(fila0.valor) === '' ? null : fila0.valor, orden, componentes: T(fila0.componentes) || undefined, fuente: T(fila0.fuente) || undefined, fecha_fuente: T(fila0.fecha_fuente) || undefined, por_omision: T(fila0.por_omision) || undefined });
            nota(tabla, 'alta', { nodo: nodoId, clave }, null, { nodo: nodoId, clave, nombre: T(fila0.nombre), implica: T(fila0.implica), valor: fila0.valor === undefined ? '' : fila0.valor, orden, componentes: T(fila0.componentes), fuente: T(fila0.fuente), fecha_fuente: T(fila0.fecha_fuente), por_omision: T(fila0.por_omision) });
          } else {
            if (cr.componentes.some((m) => m.nodo === nodoId && m.clave === clave)) { err(tabla, 0, 'clave', 'clave_duplicada', pos + ': el componente «' + clave + '» ya existe en ' + nodoId + '.'); return; }
            const falta = ['nombre', 'rol', 'unidad_base', 'cantidad', 'min', 'max', 'paso'].concat(T(fila0.unidad_base) === 'pct' ? ['base'] : []).filter((c) => T(fila0[c]) === '');
            falta.forEach((c) => err(tabla, 0, c, 'campo_obligatorio', pos + ': el componente nuevo necesita «' + c + '».'));
            if (falta.length || errores.some((e) => e.mensaje.indexOf(pos + ':') === 0)) return;
            const mayor = cr.componentes.filter((m) => m.nodo === nodoId).reduce((m, x) => Math.max(m, Number(x.orden) || 0), 0);
            const f = { nodo: nodoId, clave, nombre: T(fila0.nombre), rol: T(fila0.rol), unidad_base: T(fila0.unidad_base), cantidad: String(fila0.cantidad), m2_por_unidad: T(fila0.m2_por_unidad), base: T(fila0.base), min: String(fila0.min), max: String(fila0.max), paso: String(fila0.paso), activo_ref: T(fila0.activo_ref) || 'si', fuente: T(fila0.fuente), nota: T(fila0.nota), orden: T(fila0.orden) !== '' ? String(fila0.orden) : String(mayor + 1), version: T(fila0.version) || '1' };
            cr.componentes.push(f);
            const salida = {}; ALTA_COMPONENTE.forEach((c) => { salida[c] = f[c]; });
            nota(tabla, 'alta', { nodo: nodoId, clave }, null, salida);
          }
        } else {
          const lista = esOp ? n.opciones : cr.componentes;
          const k = lista.findIndex((x) => (esOp || x.nodo === nodoId) && x.clave === clave);
          if (k < 0) { err(tabla, 0, 'clave', 'id_inexistente', pos + ': no existe ' + (esOp ? 'la opción «' : 'el componente «') + clave + '» en ' + nodoId + '.'); return; }
          const fila = filaDe(lista[k], lista); lista.splice(k, 1);
          nota(tabla, 'baja', { nodo: nodoId, clave }, fila, {});
        }
        return;
      }

      /* cambio de una celda */
      const col = String(ch.columna || '');
      if (!col) { err(tabla, 0, '', 'cambio_invalido', pos + ': falta «columna».'); return; }
      if (COLUMNAS[tabla].indexOf(col) < 0) { err(tabla, 0, col, 'columna_desconocida', pos + ': la columna «' + col + '» no existe en ' + tabla + '.'); return; }
      if (EDITABLES[tabla].indexOf(col) < 0) { err(tabla, 0, col, 'estructura_no_editable', pos + ': la columna «' + col + '» de ' + tabla + ' ' + MOTIVO_ESTRUCTURA); return; }
      if (!('valor' in ch)) { err(tabla, 0, col, 'cambio_invalido', pos + ': falta «valor».'); return; }
      const v = ch.valor;
      if (!textoOk(v) && v !== undefined) { err(tabla, 0, col, 'valor_invalido', pos + ': el valor de «' + col + '» debe ser un texto o un número.'); return; }
      if (abreFormula(v)) { err(tabla, 0, col, 'texto_con_formula', MENSAJE_FORMULA(pos, col)); return; }
      const vacioV = v === null || v === undefined || T(v) === '';
      let fila = 0, clave = null, aplica = null;
      if (tabla === 'ARBOL_NODOS') {
        const n = nodoPorId(String(ch.id || '')); if (!n) { err(tabla, 0, 'id', 'id_inexistente', pos + ': el nodo «' + ch.id + '» no existe.'); return; }
        fila = filaDe(n, cr.nodos); clave = { id: n.id };
        if (['rango_min', 'rango_max', 'rango_paso'].indexOf(col) >= 0) aplica = () => { n.rango = n.rango || {}; const k = col.slice(6); if (vacioV) delete n.rango[k]; else n.rango[k] = v; if (!Object.keys(n.rango).length) delete n.rango; };
        else if (col.indexOf('referencia_') === 0) aplica = () => { n.referencia = n.referencia || { origen: '' }; const k = col.slice(11); if (vacioV) { if (k === 'origen') n.referencia.origen = ''; else delete n.referencia[k]; } else n.referencia[k] = v; if (n.referencia.valor === undefined && !n.referencia.opcion && !T(n.referencia.origen)) delete n.referencia; };
        else if (col === 'unidad_etiqueta') aplica = () => { n.unidad = n.unidad || {}; n.unidad.etiqueta = vacioV ? '' : String(v); };
        else if (col === 'umbral') aplica = () => { if (vacioV) delete n.umbral; else n.umbral = v; };
        else aplica = () => { if (vacioV) { if (col === 'titulo' || col === 'que_es') n[col] = ''; else delete n[col]; } else n[col] = String(v); };
      } else if (tabla === 'ARBOL_OPCIONES' || tabla === 'ARBOL_COMPONENTES') {
        const nodoId = String(ch.nodo || ''), clv = String(ch.clave || '');
        const n = nodoPorId(nodoId); if (!n) { err(tabla, 0, 'nodo', 'id_inexistente', pos + ': el nodo «' + nodoId + '» no existe.'); return; }
        const lista = tabla === 'ARBOL_OPCIONES' ? n.opciones : cr.componentes.filter((m) => m.nodo === nodoId);
        const x = lista.find((m) => m.clave === clv);
        if (!x) { err(tabla, 0, 'clave', 'id_inexistente', pos + ': no existe ' + (tabla === 'ARBOL_OPCIONES' ? 'la opción «' : 'el componente «') + clv + '» en ' + nodoId + '.'); return; }
        fila = filaDe(x, tabla === 'ARBOL_OPCIONES' ? n.opciones : cr.componentes); clave = { nodo: nodoId, clave: clv };
        if (tabla === 'ARBOL_OPCIONES') aplica = () => { if (col === 'valor') x.valor = vacioV ? null : v; else if (col === 'orden') x.orden = vacioV ? null : ENTERO(v); else if (col === 'nombre' || col === 'implica') x[col] = vacioV ? '' : String(v); else if (vacioV) delete x[col]; else x[col] = String(v); };
        else aplica = () => { x[col] = vacioV ? '' : String(v); };
      } else if (tabla === 'ARBOL_REGLAS') {
        let al = null, dueno = null; cr.nodos.forEach((n) => (n.alertas || []).forEach((a) => { if (a.id === String(ch.id || '')) { al = a; dueno = n; } }));
        if (!al) { err(tabla, 0, 'id', 'id_inexistente', pos + ': no existe la alerta «' + ch.id + '» (solo se editan textos y metas de alertas).'); return; }
        fila = al._fila || 0; clave = { id: al.id };
        aplica = () => { if (col === 'meta') { if (vacioV) al.meta = ''; else al.meta = v; } else al[col] = vacioV ? '' : String(v); };
      } else if (tabla === 'ARBOL_FACTORES') {
        const f = cr.factores.find((x) => x.id === String(ch.id || '')); if (!f) { err(tabla, 0, 'id', 'id_inexistente', pos + ': no existe el factor «' + ch.id + '».'); return; }
        fila = filaDe(f, cr.factores); clave = { id: f.id }; aplica = () => { f[col] = vacioV ? '' : String(v); };
      } else if (tabla === 'ARBOL_TIPOS') {
        if (!cr.tipo || (ch.id && cr.tipo.id !== String(ch.id))) { err(tabla, 0, 'id', 'id_inexistente', pos + ': el tipo «' + ch.id + '» no existe en esta definición.'); return; }
        fila = 2; clave = { id: cr.tipo.id };
        aplica = () => { if (col === 'nombre') cr.tipo.nombre = String(v); else if (vacioV) delete cr.tipo[col]; else cr.tipo[col] = /^-?\d+(\.\d+)?$/.test(T(v)) ? Number(v) : v; };
      } else if (tabla === 'ARBOL_LISTAS') {
        const f = cr.listas.find((x) => x.lista === String(ch.lista || '') && x.valor === String(ch.clave || '')); if (!f) { err(tabla, 0, 'lista', 'id_inexistente', pos + ': no existe el valor «' + ch.clave + '» de la lista «' + ch.lista + '».'); return; }
        fila = filaDe(f, cr.listas); clave = { lista: f.lista, valor: f.valor }; aplica = () => { f.nombre = vacioV ? '' : String(v); };
      }
      aplica();
      nota(tabla, 'cambia', clave, fila, { [col]: vacioV ? '' : v });
    });
    if (errores.length) return vacio({ huella_antes: huellaAntes });

    /* 2 · lo editado se valida con carga (la misma de siempre); la definición original no se tocó */
    const nuevo = clonar(cr);
    nuevo.tipo = Object.assign({}, nuevo.tipo, { quita: [], parchea: {} });   // ya se aplicaron al normalizar
    delete nuevo.fuente; delete nuevo.versiones;
    const r = carga(nuevo);
    r.errores.forEach((e) => errores.push(e));
    const filas_cambiadas = {}; Object.keys(filas).forEach((t) => { filas_cambiadas[t] = filas[t]; });
    return { ok: r.errores.length === 0, definicion: r.errores.length ? null : r.definicion, errores, filas_cambiadas, advertencias: r.advertencias || [], huella_antes: huellaAntes, huella_despues: r.huella || null };
  }

  /* el grafo de dependencias, para resaltar «qué depende de qué» sin recalcular nada */
  function grafo(definicion) {
    const D = definicion && definicion._interna; if (!D) return null;
    const aristas = []; D.deps.forEach((l, i) => l.forEach((d) => { if (d.tipo !== 'de') aristas.push({ de: D.ids[d.j], a: D.ids[i], tipo: d.tipo }); }));
    /* lo que lee la condición o la medida de una alerta también cuenta como arista hacia su dueño (no entra al orden de cálculo: no cambia valores) */
    D.cn.forEach((c) => c.alertas.forEach((al) => aristasDeAlerta(D, al).forEach((lista, j) => lista.forEach((e) => { if (!aristas.some((q) => q.de === D.ids[j] && q.a === D.ids[e.a] && q.tipo === 'condicion')) aristas.push({ de: D.ids[j], a: D.ids[e.a], tipo: 'condicion', alerta: al.id }); }))));
    const recorre = (id, hacia) => {
      const j = D.ix.get(id); if (j === undefined) return [];
      const vis = new Set(), pila = [j];
      while (pila.length) { const u = pila.pop(); (hacia === 'abajo' ? D.sal[u].map((e) => e.a) : D.deps[u].filter((d) => d.tipo !== 'de').map((d) => d.j)).forEach((v) => { if (!vis.has(v)) { vis.add(v); pila.push(v); } }); }
      return D.orden.filter((q) => vis.has(q)).map((q) => D.ids[q]);
    };
    return { orden: D.orden.map((i) => D.ids[i]), aristas, dependientes: (id) => recorre(id, 'abajo'), ancestros: (id) => recorre(id, 'arriba'), ciclos: [] };
  }

  return { carga, valida, evalua, sugiere, compara, paqueteVisor, planConCambio, grafo, analiza, evaluaExpresion, editaDefinicion, REGLAS_VEREDICTO, ROTULO, VERSION: VERSION_MOTOR, TARJETAS, PRUEBAS_LIBRO, AREAS, areasACelda, celdaAAreas, nuevaClaveArea, validaNombreArea,
    reparto, registraReparto, visorFechas: visorFechasPublica, MEDIDAS_REPARTO, REPARTO_LEE, moduloReparto: () => moduloReparto(), planConOpcion, extiende };
});
