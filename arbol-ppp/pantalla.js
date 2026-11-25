/* Árbol PPP · pantalla (v3: comparador lado a lado, editor de reglas en el lugar; sobre la v2: motor real, alertas con ruta, componentes, fuentes, pruebas de riesgo).
   Habla SOLO por el contrato pantalla–motor (D7 v1.2, Anexo B): motor.carga(), motor.evalua(). No calcula nada:
   pinta lo que el motor entrega, captura lo que la persona hace y lo manda como `cambio`.
   Lienzo: arrastre con un dedo, pellizco con dos, rueda, botones, doble toque para centrar; Pointer Events.
   Comparador: motor.compara(A, cambios) con los `cambios` que salen de comparar el plan A con el plan B; las cifras de las siete tarjetas salen de evalua() de cada plan.
   Editor de reglas: todo cambio pasa por motor.editaDefinicion(definición original, lista de cambios); si no valida, se muestra el error junto al campo y no se aplica.
   La pantalla NO escribe en Sheets: «Exportar» solo genera texto para pegar en las pestañas ARBOL_*. */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const COL = 112, FILA = 78, MX = 64, MY = 44;                 // rejilla del árbol (unidades del mundo)
  const KMIN = 0.2, KMAX = 2.8, KSEG = 0.62, KLEG = 0.5;                   // límites de zoom; zoom mínimo al seguir la rama nueva
  const ORDEN_TARJETAS = ['Terreno', 'Producto', 'Tiempo', 'Costo y ganancia', 'Dinero', 'Reparto', 'Riesgo y estado'];
  const SLUG = { 'Terreno': 'terreno', 'Producto': 'producto', 'Tiempo': 'tiempo', 'Costo y ganancia': 'costo', 'Dinero': 'dinero', 'Reparto': 'reparto', 'Riesgo y estado': 'riesgo' };
  const CLAVE_LS = 'ppp-arbol-pantalla-2', CLAVE_REG = 'ppp-arbol-reglas-1', CLAVE_CMP = 'ppp-arbol-comparacion-1';
  const TIPO_TXT = { se_decide: 'Se decide', se_busca: 'Se busca', regla_oficio: 'Regla del oficio', calculado: 'Calculado' };
  const ESTADO_TXT = { referencia: 'Referencia · por confirmar', no_se: 'Pendiente · con referencia', decidido: 'Decidido', confirmado: 'Confirmado', reabierto: 'Se reabrió' };
  const TXT_REPARTO = 'tras banco y capital';
  const MOTIVO_NA = { sin_banco: 'sin banco', sin_dato: 'falta calcular', banco_sin_uso: 'el banco no se usa' };
  /* Estrellas (24-nov-2026): un dato que alimenta la presentación lleva una estrella. Solo existen si la definición trae ARBOL_PRESENTACION; sin ella nada de esto se pinta. */
  const ESTRELLA_TXT = { llena: 'dato firme', supuesto: 'con supuesto por confirmar', vacia: 'todavía sin dato' };
  const FICHA_TXT = { inversionista: 'Inversionista', dueno: 'Dueño del terreno' };
  const ESTRELLA_D = (() => { let d = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, R = k % 2 ? 3.4 : 7.8; d += (k ? 'L' : 'M') + (R * Math.cos(a)).toFixed(2) + ',' + (R * Math.sin(a)).toFixed(2); } return d + 'Z'; })();

  /* ───── utilidades ───── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d) => isFinite(x) ? Number(x).toLocaleString('es-MX', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) : '—';
  const ls = {
    get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: la pantalla sigue igual */ } },
    del(k) { try { root.localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } },
  };
  const reducido = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const corto = (t, n) => { t = String(t == null ? '' : t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const redondea = (x, d) => +Number(x).toFixed(d == null ? 6 : d);

  /* formato por clase de unidad; v va en unidades de la VISTA (millones si el dinero se muestra en millones) */
  function fmt(v, u) {
    if (v == null) return '—';
    if (typeof v === 'string') return u && u.clase === 'si_no' ? (v === 'si' ? 'Sí' : v === 'no' ? 'No' : v) : v;
    if (!isFinite(v)) return '—';
    switch (u.clase) {
      case 'm2': return nf(v) + ' m²';
      case 'pct': { const p = v * 100; return nf(p, Math.abs(p - Math.round(p)) < 1e-9 ? 0 : 1) + '%'; }
      case 'mxn': return (v < 0 ? '−' : '') + (u.escala === 1e6 ? '$' + nf(Math.abs(v), 1) + ' M' : '$' + nf(Math.abs(v)));
      case 'mxn_m2': return (v < 0 ? '−' : '') + '$' + nf(Math.abs(v)) + ' por m²';
      case 'n': return nf(v);
      case 'n1': return String(+Number(v).toFixed(2));
      case 'veces': return '×' + nf(v, 2);
      case 'mes': return u.etiqueta === 'mes' ? 'mes ' + nf(v) : nf(v) + (v === 1 ? ' mes' : ' meses');
      case 'u_mes': return (+Number(v).toFixed(1)) + ' al mes';
      default: return String(v);
    }
  }
  /* un valor en unidades del factor (pesos…) → unidades de la vista (millones…) usando lo que ya trae el nodo */
  const aVista = (n, v) => {
    if (v == null || typeof v !== 'number') return v;
    if (typeof n.valor === 'number' && typeof n.valor_vista === 'number' && n.valor !== 0) return v * n.valor_vista / n.valor;
    return n.unidad && n.unidad.escala ? v / n.unidad.escala : v;
  };
  /* cifra de tarjeta en versión corta (nivel 1) o muy corta (nivel 2): M = millones, MM = miles de millones (mil millones); se usa solo cuando la completa no cabe */
  const fmtCifraCorta = (c, nivel) => {
    if (c.valor == null) return '?';
    if (typeof c.valor === 'string') return c.valor;
    const u = c.unidad || {}, v = u.clase === 'mxn' && u.escala ? c.valor / u.escala : c.valor, sp = nivel === 2 ? '' : ' ';
    if (u.clase === 'mxn') {
      const m = u.escala === 1e6 ? v : v / 1e6, a = Math.abs(m), sg = m < 0 ? '−' : '';
      return a >= 1000 ? sg + '$' + nf(a / 1000, a / 1000 >= 100 ? 0 : 1) + sp + 'MM' : sg + '$' + nf(a, a >= 100 || nivel === 2 && a >= 10 ? 0 : 1) + sp + 'M';
    }
    if (u.clase === 'm2') return Math.abs(v) >= 1e6 ? nf(v / 1e6, 1) + sp + 'M m²' : nivel === 2 && Math.abs(v) >= 1e5 ? nf(v / 1e6, 2) + 'M m²' : nf(v) + (nivel === 2 ? '' : ' ') + 'm²';
    if (u.clase === 'mes') return u.etiqueta === 'mes' ? 'mes ' + nf(v) : nf(v) + (v === 1 ? ' mes' : nivel === 2 ? ' m' : ' mes.');
    return fmt(v, u);
  };
  /* SPPP · T-10 v3 (dictamen T-11 v2, punto 2): una cifra del reparto con valor negativo trae «etiqueta_reparto» («Pérdida asignada (teórica) · …»);
     la tarjeta y los avisos la usan en lugar de la etiqueta normal. Sin módulo de repartos la cifra no la trae y todo se ve igual que antes. */
  const etiquetaCifra = (c) => (c && c.etiqueta_reparto) || (c && c.etiqueta);
  /* SPPP · T-10 v3 (punto 1): las claves de localStorage aceptan un prefijo para que una página de prueba no lea ni escriba los planes del Árbol habitual */
  function clavesAlmacen(opts) {
    const pre = opts && typeof opts.prefijoAlmacen === 'string' && opts.prefijoAlmacen ? opts.prefijoAlmacen : '';
    return { plan: pre + CLAVE_LS, reglas: pre + CLAVE_REG, comparacion: pre + CLAVE_CMP };
  }
  const fmtCifra = (c) => {
    if (c.valor == null) return '?';
    if (typeof c.valor === 'string') return c.valor;
    return fmt(c.unidad.clase === 'mxn' && c.unidad.escala ? c.valor / c.unidad.escala : c.valor, c.unidad);
  };

  /* ───── montaje ───── */
  /* texto de una tarjeta con cifras (todas menos «Riesgo y estado»): fuera de montar para poder probarlo sin pantalla */
  function textoCifras(nombre, T) {
    const cs = T.cifras.filter((c) => c.valor != null);
    if (!cs.length) return { h: '?', s: ['cerrada'], est: false };
    const s2 = cs[1] ? [etiquetaCifra(cs[0]), etiquetaCifra(cs[1]) + ' ' + fmtCifra(cs[1])] : [etiquetaCifra(cs[0])];
    if (nombre === 'Reparto') s2.push(TXT_REPARTO);      // el reparto es el del libro: después de pagar banco y capital
    return { h: fmtCifra(cs[0]), hc: fmtCifraCorta(cs[0], 1), hcc: fmtCifraCorta(cs[0], 2), s: s2, est: cs.slice(0, 2).some((c) => c.estado === 'estimado') };
  }
  function montar(host, opts) {
    if (host.__ppp) host.__ppp.destruir();
    opts = opts || {};
    const CL = clavesAlmacen(opts);
    const motor = opts.motor || root.ArbolMotor;
    const proyecto = opts.proyecto || 'Predio de muestra';
    const ubicacion = opts.ubicacion || 'Ubicación de muestra';
    const escucha = [];                                          // para destruir
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); escucha.push([t, ev, fn, o]); };
    const fuenteDef = opts.tablas || opts.definicion || root.ARBOL_TABLAS || root.ARBOL_DEFINICION;
    const tablas0 = (fuenteDef && !Array.isArray(fuenteDef.nodos) && fuenteDef.ARBOL_NODOS && Array.isArray(fuenteDef.ARBOL_NODOS[0])) ? fuenteDef : null;   // pestañas ARBOL_* en matriz con encabezado: de ahí salen las filas completas para exportar
    const cargado = motor.carga(fuenteDef);
    host.innerHTML = '';
    if (cargado.errores && cargado.errores.length) {
      host.innerHTML = '<div class="ppp"><p class="aviso">No se pudo cargar la definición del árbol: ' + esc(cargado.errores.map((e) => e.mensaje).join(' ')) + '</p></div>';
      return null;
    }
    const DEF0 = cargado.definicion;
    let DEF = DEF0;
    /* reglas editadas en la sesión (borrador): la lista de cambios se aplica SIEMPRE a la definición original */
    let cambiosRegla = [], filasRegla = {}, tablasAct = tablas0, editar = false, errCampo = null, verExport = false;
    try {
      const g = JSON.parse(ls.get(CL.reglas) || 'null');
      if (Array.isArray(g) && g.length) { const r0 = motor.editaDefinicion(DEF0, g); if (r0.ok) { cambiosRegla = g; DEF = r0.definicion; filasRegla = r0.filas_cambiadas || {}; } }
    } catch (e) { /* borrador ilegible: se empieza con la definición original */ }

    /* ----- estado ----- */
    const planInicial = () => ({ tipo: 'vertical', valores: { 'T-01': { estado: 'confirmado', valor: 2000, fuente: 'dato de muestra' } }, datos: { 'I-08': ubicacion } });
    function leePlan() {
      try {
        const g = JSON.parse(ls.get(CL.plan) || 'null');
        if (g && g.plan && g.plan.valores && g.plan.valores['T-01']) { const r = motor.evalua(DEF, g.plan); if (!(r.errores || []).length) return g.plan; }
      } catch (e) { /* plan guardado ilegible: se empieza de cero */ }
      return null;
    }
    let plan = leePlan() || planInicial();
    let res = motor.evalua(DEF, plan);
    plan = res.plan;
    let sel = null, vista = 'nodo', plegados = new Set(), modoResumen = true, ultimosErrores = [];
    let fichaPres = 'todas';      // filtro de la vista «Presentación»: todas, inversionista o dueno
    let umbralAbierto = new Set(), areaForm = { abierto: false, nombre: '', vende: 'no', unidad: 'm2', valor: '' }, confArea = false;
    let historia = [], ruta = null, efecto = null, compSel = null, compUni = {}, franjaCerrada = false, toastTxt = '', panelClave = '';
    let cam = { x: 0, y: 0, k: 1 }, vw = 0, vh = 0;
    const tgt = new Map(), disp = new Map(), desde = new Map(), elems = new Map(), aristas = new Map();
    let anim = { cam: null, lay: null }, raf = 0, bbox = { x0: 0, y0: 0, x1: 1, y1: 1 }, visibles = [], hijosDe = {}, ocultosPlie = {};
    let tarjAntes = {}, temporizadores = [], reinicioPend = 0;
    let cmp = null, ultimoToque = null, forzarArriba = false, cierre = null, avisoCache = { clave: '', v: null };          // comparación A/B en curso; último toque del panel (contra el doble toque)

    const guarda = () => { ls.set(CL.plan, JSON.stringify({ plan })); guardaCmp(); };
    const porId = (id) => res.nodos.find((n) => n.id === id);
    const colorDe = (n) => 'var(--' + (SLUG[(n.tarjetas || [])[0]] || 'confirmar') + ')';
    const alertasRotas = () => (res.alertas || []).filter((a) => a.nivel !== 'info');
    const alertasDe = (id) => (res.alertas || []).filter((a) => a.nodo === id || (a.sobre || []).indexOf(id) >= 0);
    const tituloDe = (id) => { const n = porId(id); return n ? n.titulo : id; };
    /* P1: ningún mensaje muestra IDs técnicos (T-01, P1-06…): se cambian por el título del dato («Ritmo de ventas») */
    const titulosTabla = {};
    const tituloTabla = (id) => {
      const tb = tablasAct || tablas0; if (!tb) return null;
      if (!titulosTabla[id] || titulosTabla.__t !== tb) {
        if (titulosTabla.__t !== tb) { Object.keys(titulosTabla).forEach((k) => delete titulosTabla[k]); titulosTabla.__t = tb; }
        [['ARBOL_NODOS', 'titulo'], ['ARBOL_FACTORES', 'nombre']].forEach(([t, c]) => { const m = tb[t]; if (!m) return; const ii = m[0].indexOf('id'), ic = m[0].indexOf(c); for (let i = 1; i < m.length; i++) if (!titulosTabla[m[i][ii]] && m[i][ic]) titulosTabla[m[i][ii]] = m[i][ic]; });
      }
      return titulosTabla[id] || null;
    };
    const sinIds = (t) => String(t == null ? '' : t).replace(/«?\b[A-Z]{1,3}\d?-\d{2}\b»?/g, (m) => { const id = m.replace(/[«»]/g, ''), n = porId(id), ti = n ? n.titulo : tituloTabla(id); return ti ? '«' + ti + '»' : 'otro dato'; });
    const esRojo = (n) => (res.rojos && res.rojos.nodos || []).indexOf(n.id) >= 0 || alertasRotas().some((a) => a.nivel === 'alto' && a.nodo === n.id);
    const esAmbar = (n) => !esRojo(n) && alertasRotas().some((a) => a.nodo === n.id);

    /* ----- estructura de la página ----- */
    host.innerHTML =
      '<div class="ppp" data-ppp>' +
      '<header class="ppp-top"><h1>Árbol PPP <span class="ppp-proy">' + esc(proyecto) + '</span></h1><div class="ppp-acc"><button class="ppp-btn" type="button" data-act="deshacer" disabled>Deshacer</button><button class="ppp-btn" type="button" data-act="reiniciar">Empezar de nuevo</button></div></header>' +
      '<section class="ppp-cards" aria-label="Visor del plan: siete tarjetas" data-cards></section>' +
      '<div class="ppp-barra" data-barra><span class="ppp-rotulo" role="status" data-rotulo>Estimado · no sincronizado</span><span class="ppp-avance" data-avance></span></div>' +
      '<div class="ppp-herr" data-herr role="group" aria-label="Herramientas"><button class="ppp-btn chico" type="button" data-act="comparar" aria-pressed="false">Comparar</button><button class="ppp-btn chico" type="button" data-act="editar" aria-pressed="false">Editar reglas</button><button class="ppp-btn chico" type="button" data-act="lista" aria-pressed="false">Ver en lista</button><button class="ppp-btn chico pres-b" type="button" data-act="presentacion" aria-pressed="false" hidden>Presentación</button><button class="ppp-btn chico" type="button" data-act="ley" aria-expanded="false" aria-controls="ppp-ley">Leyenda</button></div>' +
      '<div class="ppp-modo" data-modo hidden role="status"></div>' +
      '<div class="ppp-cmpbar" data-cmpbar hidden></div>' +
      '<div class="ppp-ley" id="ppp-ley" data-ley hidden><div class="ley-grid" data-leyenda></div></div>' +
      '<section class="ppp-horizonte" data-horizonte role="alert" hidden></section>' +
      '<section class="ppp-franja" data-franja role="region" aria-label="Alertas del plan" hidden></section>' +
      '<div class="ppp-lienzo" data-lienzo tabindex="-1">' +
      '<svg data-svg role="group" aria-label="Árbol de decisiones del plan. Cada bolita es un dato; la rama crece a la derecha conforme se define. Usa las flechas para moverte entre bolitas, Enter para abrirla, F para plegar su rama."><g data-mundo><g data-aristas></g><g data-nodos></g></g></svg>' +
      '<div class="ppp-ctrl" role="group" aria-label="Zoom y vista"><button class="zb" type="button" data-act="mas" aria-label="Acercar" title="Acercar">+</button><button class="zb" type="button" data-act="menos" aria-label="Alejar" title="Alejar">−</button>' +
      '<button class="zb" type="button" data-act="todo" aria-label="Ver todo el árbol (pliega lo ya resuelto)" title="Ver todo (pliega lo ya resuelto)"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<button class="zb" type="button" data-act="abierto" aria-label="Ir a la decisión abierta" title="Ir a la decisión abierta"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>' +
      '<button class="zb" type="button" data-act="resumen" aria-pressed="true" aria-label="Plegar lo ya resuelto" title="Plegar lo ya resuelto"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 7h14M8 12h8M11 17h2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></div>' +
      '<div class="sr" aria-live="polite" data-voz></div></div>' +
      '<section class="ppp-panel" data-panel aria-live="polite" aria-label="Detalle del dato elegido"></section>' +
      '<section class="ppp-cmpv" data-cmpv aria-label="Comparación de las dos versiones" hidden></section></div>';
    const $ = (s) => host.querySelector(s);
    const ppp = $('[data-ppp]'), lienzo = $('[data-lienzo]'), svg = $('[data-svg]'), mundo = $('[data-mundo]'), gAr = $('[data-aristas]'), gNo = $('[data-nodos]'), panelEl = $('[data-panel]'), voz = $('[data-voz]');
    const horEl = $('[data-horizonte]'), franjaEl = $('[data-franja]'), leyEl = $('[data-ley]'), modoEl = $('[data-modo]'), cmpBarEl = $('[data-cmpbar]'), cmpVEl = $('[data-cmpv]');
    leyenda();

    /* ----- leyenda (fuera del lienzo: no tapa nodos) ----- */
    function icono(tipo, cls, extra) {
      const forma = { se_decide: '<circle class="forma" r="8"/>', se_busca: '<path class="forma" d="M0,-9 L9,0 L0,9 L-9,0Z"/>', regla_oficio: '<path class="forma" d="M8,0 L4,6.9 L-4,6.9 L-8,0 L-4,-6.9 L4,-6.9Z"/>', calculado: '<circle class="forma" r="8"/><circle class="interior" r="3.5"/>' }[tipo];
      return '<svg viewBox="-12 -12 24 24" aria-hidden="true"><g class="nodo t-' + tipo + ' ' + cls + '" style="--c:var(--terreno)">' + (extra || '') + forma + (cls.indexOf('e-conf') >= 0 ? '<path class="check" d="M-3.5,0 L-1,3 L3.5,-3"/>' : '') + '</g></svg>';
    }
    function leyenda() {
      $('[data-leyenda]').innerHTML =
        '<h3>Tipo</h3><h3>Estado</h3>' +
        '<span>' + icono('se_decide', 'e-dec') + 'Se decide</span><span>' + icono('se_busca', 'e-ref') + 'Referencia</span>' +
        '<span>' + icono('se_busca', 'e-dec') + 'Se busca</span><span>' + icono('se_decide', 'e-nose') + 'No sé todavía</span>' +
        '<span>' + icono('regla_oficio', 'e-dec') + 'Regla del oficio</span><span>' + icono('se_decide', 'e-abierta', '<circle class="halo" r="12" style="display:block"/>') + 'Te toca decidir</span>' +
        '<span>' + icono('calculado', 'est') + 'Calculado (estimado)</span><span>' + icono('se_decide', 'e-dec') + 'Decidido</span>' +
        '<span>' + icono('calculado', '') + 'Calculado (firme)</span><span>' + icono('se_busca', 'e-conf', '<circle class="sello" r="12" style="display:block"/>') + 'Confirmado</span>' +
        '<span><svg viewBox="-12 -12 24 24" aria-hidden="true"><g class="plie" style="--c:var(--terreno)"><circle class="fondo" r="8"/><text y="4">+3</text></g></svg>Rama plegada (toca)</span><span>' + icono('se_decide', 'e-reab', '<circle class="halo" r="12" style="display:block"/>') + 'Se reabrió</span>' +
        '<span><svg viewBox="-12 -12 24 24" aria-hidden="true"><g class="nodo e-dec rojo" style="--c:var(--terreno)"><circle class="halo" r="11" style="display:block"/><circle class="forma" r="7"/></g></svg>Rojo: no pasa</span><span><svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M-11,6 C-4,6 -4,-6 3,-6 L11,-6" fill="none" stroke="var(--rojo)" stroke-width="3.5" stroke-linecap="round"/></svg>Ruta de la causa</span>' +
        (res.presentacion ? ['llena', 'supuesto', 'vacia'].map((e) => '<span><svg viewBox="-12 -12 24 24" aria-hidden="true"><g class="estr ' + e + '"><path d="' + ESTRELLA_D + '"/></g></svg>Presentación: ' + ESTRELLA_TXT[e] + '</span>').join('') + '<span></span>' : '') +
        '<p class="ley-hint">Color = tarjeta del visor que alimenta. Al tocar una alerta se resalta la ruta y se atenúa lo demás.</p>';
    }

    /* ----- tarjetas del visor ----- */
    function textoTarjeta(nombre, T) {
      if (nombre === 'Riesgo y estado') {
        const items = res.pruebas.items || [], calc = items.filter((i) => i.estado !== 'na');
        if (!calc.length) return { h: '—', s: ['Sin revisión', 'para fondos'], est: false };
        const fuera = items.filter((i) => i.estado === 'fuera'), cif = T.cifras.find((c) => c.id === 'RV-10');
        const pasan = cif && cif.valor != null ? cif.valor : items.filter((i) => i.estado !== 'fuera').length;
        const up = (T.umbrales_propios || []).filter((u) => u && u.nota);      // decisión C: el umbral de una prueba puede ser propio del plan; se marca a la vista
        const marca = up.length === 1 ? up[0].nota : up.length ? 'umbrales propios en ' + up.length + ' pruebas; el libro pide otros' : null;
        return { h: pasan + ' de ' + items.length, s: [fuera.length ? fuera.length + (fuera.length === 1 ? ' no pasa' : ' no pasan') : 'Todo pasa', marca || 'toca para ver'], est: true, marca: !!marca };
      }
      return textoCifras(nombre, T);
    }
    function pintaTarjetas() {
      let html = '';
      const flash = [], rojas = ((res.rojos && res.rojos.tarjetas) || []).concat(avisoArbol() ? TARJ_DINERO : []);
      ORDEN_TARJETAS.forEach((nombre) => {
        const T = res.tarjetas[nombre]; if (!T) return;
        const abierta = nombre === 'Riesgo y estado' ? true : T.encendida;
        const t = abierta ? textoTarjeta(nombre, T) : { h: '?', s: ['cerrada'], est: false };
        const clave = t.h + '|' + t.s.join('|'), antes = tarjAntes[nombre];
        const cambio = antes !== undefined && (antes !== clave) && abierta;
        tarjAntes[nombre] = clave;
        if (cambio) flash.push(nombre);
        const roja = abierta && rojas.indexOf(nombre) >= 0, esRiesgo = nombre === 'Riesgo y estado';
        html += '<div class="tarj ' + (abierta ? '' : 'cerrada') + (roja ? ' roja' : '') + (esRiesgo ? ' toca' : '') + '" data-t="' + esc(nombre) + '" style="--c:var(--' + SLUG[nombre] + ')" ' + (esRiesgo ? 'role="button" tabindex="0" data-abre="pruebas" ' : 'role="group" ') + 'aria-label="' + esc(nombre) + ': ' + esc(abierta ? t.h + ', ' + t.s.join(' ') + (t.est ? ', estimado' : '') + (roja ? (avisoArbol() && TARJ_DINERO.indexOf(nombre) >= 0 ? ', cifra no confiable: el plan se sale del horizonte' : ', con pruebas en rojo') : '') : 'cerrada, sin cifra todavía') + '">' +
          '<b>' + esc(nombre) + (roja ? '<i class="rj" title="Hay algo en rojo" aria-hidden="true">!</i>' : t.est ? '<i title="Estimado" aria-hidden="true">≈</i>' : '') + '</b><strong data-c="' + esc(t.hc || t.h) + '" data-cc="' + esc(t.hcc || t.hc || t.h) + '">' + esc(t.h) + '</strong><span>' + t.s.map((x, ix) => '<em' + (t.marca && ix === t.s.length - 1 ? ' class="up"' : '') + '>' + esc(x) + '</em>').join('') + '</span></div>';
      });
      const pc = res.por_confirmar.n;
      html += '<div class="tarj conf" role="group" aria-label="Por confirmar: ' + pc + '. Es la distancia entre el estimado y el plan completo."><b>Por confirmar</b><strong>' + pc + '</strong><span>' + (pc ? 'para el plan completo' : 'plan completo') + '</span></div>';
      $('[data-cards]').innerHTML = html;
      ajustaCifras();
      flash.forEach((n) => { const e = host.querySelector('.tarj[data-t="' + n + '"]'); if (e) { e.classList.add('cambio'); temporizadores.push(setTimeout(() => e.classList.remove('cambio'), 1000)); } });
      const dec = res.nodos.filter((n) => n.tipo === 'se_decide' && (n.estado === 'decidido' || n.estado === 'no_se')).length;
      $('[data-avance]').innerHTML = '<b>' + dec + '</b> decididas · <b>' + res.abiertas.length + '</b>/' + res.cupo + ' abiertas' + (res.en_espera ? ' · ' + res.en_espera + ' en espera' : '');
      pintaBotonPres();
    }
    /* el botón «Presentación» solo existe para una definición con estrellas; dice cuántos datos de presentación ya están completos */
    function pintaBotonPres() {
      const b = host.querySelector('[data-act="presentacion"]'), P = res.presentacion; if (!b) return;
      b.hidden = !P; if (b.parentNode) b.parentNode.classList.toggle('con-pres', !!P);
      if (!P) return;
      b.innerHTML = '<span class="estr-g" aria-hidden="true">' + (P.completa ? '★' : '☆') + '</span> ' + P.completos + '/' + P.total;
      b.classList.toggle('completa', !!P.completa);
      b.setAttribute('aria-label', 'Presentación: ' + P.completos + ' de ' + P.total + ' datos completos' + (P.faltan.length ? '; faltan ' + P.faltan.length + ' datos clave' : ''));
      b.title = 'Presentación: qué datos la alimentan y cuáles faltan';
    }

    /* F4: una cifra de tarjeta nunca se corta con «…»: si la completa no cabe se usa la corta (M = millones, MM = miles de millones) y, si aún no cabe, baja la letra (nunca menos de 11 px) */
    function ajustaCifras() {
      const ancho = (e) => { try { const r = root.document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().width; } catch (x) { return e.scrollWidth; } };
      host.querySelectorAll('.tarj strong').forEach((e) => {
        const full = e.getAttribute('data-full') || e.textContent, c1 = e.getAttribute('data-c') || full, c2 = e.getAttribute('data-cc') || c1;
        e.setAttribute('data-full', full); e.style.fontSize = ''; e.textContent = full;
        const base = parseFloat(root.getComputedStyle(e).fontSize) || 14, cabe = () => !e.clientWidth || ancho(e) <= e.clientWidth + 0.5;
        const prueba = (txt, minPx) => { e.textContent = txt; for (let px = base; px >= minPx; px -= 0.5) { e.style.fontSize = px === base ? '' : px + 'px'; if (cabe()) return true; } return false; };
        if (prueba(full, base) || prueba(c1, base) || prueba(c2, base) || prueba(full, 12.5) || prueba(c1, 12.5) || prueba(c2, 11)) return;
        e.style.fontSize = '11px';
      });
    }

    /* ----- aviso del motor: el plan se sale del horizonte (o la cobranza no cuadra); las cifras de dinero no son confiables ----- */
    function avisoArbol() {
      const clave = JSON.stringify(plan) + '|' + DEF.huella;
      if (avisoCache.clave === clave) return avisoCache.v;
      let v = null;
      try { const pq = motor.paqueteVisor(DEF, plan); v = (pq && pq.aviso_arbol) || null; } catch (e) { v = null; }
      avisoCache = { clave, v }; return v;
    }
    const TARJ_DINERO = ['Costo y ganancia', 'Dinero', 'Reparto'];
    function pintaHorizonte() {
      const a = avisoArbol();
      if (!a) { horEl.hidden = true; horEl.innerHTML = ''; return; }
      const titulo = a.codigo === 'fuera_del_horizonte' ? 'El plan se sale del horizonte de ' + a.horizonte_meses + ' meses' : 'La cobranza no cuadra';
      const may = (t) => { t = String(t || '').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
      const txt = sinIds(a.texto), corte = txt.indexOf(' con este plan: '), consejo = corte >= 0 ? may(txt.slice(corte + ' con este plan: '.length)) : txt;
      horEl.innerHTML = '<p class="hz-t"><span class="al-i" aria-hidden="true">!</span><span><strong>' + esc(titulo) + '.</strong> <span class="hz-r">' + esc(may(sinIds((a.razones || []).join('; ')))) + '.</span> Las cifras de dinero no son confiables.</span></p>' +
        '<details class="hz-d"><summary>Qué hacer</summary><p><span class="hz-r-d">' + esc(may(sinIds((a.razones || []).join('; ')))) + '. </span>' + esc(consejo) + '</p></details>';
      horEl.hidden = false;
    }

    /* ----- franja de alertas ----- */
    function pintaFranja() {
      const rotas = alertasRotas(), nuevas = rotas.filter((a) => a.nueva);
      if (!rotas.length || franjaCerrada) { franjaEl.hidden = true; franjaEl.innerHTML = ''; return; }
      const peor = rotas.filter((a) => !a.nueva && a.empeoro);
      const lista = nuevas.length ? nuevas.concat(peor) : rotas;
      const cuenta = (l, tipo) => l.filter((a) => (a.nivel === 'alto') === (tipo === 'alto')).length;
      const pl = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
      const partes = [];
      if (nuevas.length) {
        const na = cuenta(nuevas, 'alto'), nv = cuenta(nuevas, 'aviso');
        if (na) partes.push('<b>' + pl(na, 'cosa dejó', 'cosas dejaron') + ' de pasar por este cambio</b>');
        if (nv) partes.push((na ? '' : '<b>') + pl(nv, 'aviso nuevo', 'avisos nuevos') + (na ? '' : ' por este cambio</b>'));
        if (peor.length) partes.push(pl(peor.length, 'empeoró', 'empeoraron'));
      } else {
        const na = cuenta(rotas, 'alto'), nv = cuenta(rotas, 'aviso');
        if (na) partes.push('<b>' + pl(na, 'cosa no pasa', 'cosas no pasan') + '</b>' + (na ? ' todavía' : ''));
        if (nv) partes.push((na ? '' : '<b>') + pl(nv, 'aviso', 'avisos') + (na ? '' : '</b>') + ' (no bloquean)');
      }
      const titulo = partes.join(' · ');
      const grupos = [];                                        // un botón por nodo dueño (varias alertas del mismo nodo se juntan)
      lista.forEach((a) => { let g = grupos.find((x) => x.nodo === a.nodo); if (!g) { g = { nodo: a.nodo, alertas: [], alto: false }; grupos.push(g); } g.alertas.push(a); if (a.nivel === 'alto') g.alto = true; });
      const activa = ruta ? ruta.alertas : [];
      franjaEl.innerHTML = '<p class="fr-t" role="status">' + titulo + '</p><div class="fr-chips">' +
        grupos.map((g) => '<button type="button" class="fr-chip ' + (g.alto ? 'alto' : 'aviso') + (g.alertas.some((a) => activa.indexOf(a.id) >= 0) ? ' on' : '') + '" data-alerta="' + esc(g.alertas[0].id) + '" aria-label="' + esc((g.alto ? 'No pasa: ' : 'Aviso: ') + sinIds(g.alertas.map((a) => a.texto).join(' ')) + ' Toca para ver la ruta de la causa.') + '"><i aria-hidden="true">!</i>' + esc(corto(tituloDe(g.nodo), 22)) + (g.alertas.length > 1 ? ' ×' + g.alertas.length : '') + '</button>').join('') +
        (ruta ? '<button type="button" class="fr-quita" data-act="quitar-ruta" aria-label="Quitar el resaltado de la ruta">Quitar resaltado</button>' : '') + '</div>';
      franjaEl.hidden = false;
    }

    /* ----- disposición del árbol ----- */
    function disposicion() {
      const nodos = res.nodos;
      const ids = new Set(nodos.map((n) => n.id));
      hijosDe = {}; nodos.forEach((n) => { if (n.de && ids.has(n.de)) (hijosDe[n.de] = hijosDe[n.de] || []).push(n.id); });
      ocultosPlie = {};
      const oculto = new Set();
      const marca = (id, plegadoArriba) => { (hijosDe[id] || []).forEach((h) => { if (plegadoArriba) oculto.add(h); marca(h, plegadoArriba || plegados.has(h)); }); };
      const raiz = nodos.find((n) => n.raiz) || nodos[0]; if (!raiz) { visibles = []; return; }
      marca(raiz.id, plegados.has(raiz.id));
      plegados.forEach((p) => { if (!ids.has(p)) plegados.delete(p); });
      const cuenta = (id) => (hijosDe[id] || []).reduce((a, h) => a + 1 + cuenta(h), 0);
      plegados.forEach((p) => { ocultosPlie[p] = cuenta(p); });
      visibles = nodos.filter((n) => !oculto.has(n.id));
      const vis = new Set(visibles.map((n) => n.id)), hv = {};
      visibles.forEach((n) => { if (n.de && vis.has(n.de)) (hv[n.de] = hv[n.de] || []).push(n); });
      let fila = 0;
      (function coloca(n, p) { const hs = hv[n.id] || []; if (!hs.length) { tgt.set(n.id, { x: MX + p * COL, y: MY + fila++ * FILA }); return; } hs.forEach((h) => coloca(h, p + 1)); tgt.set(n.id, { x: MX + p * COL, y: (tgt.get(hs[0].id).y + tgt.get(hs[hs.length - 1].id).y) / 2 }); })(raiz, 0);
      tgt.forEach((_, id) => { if (!vis.has(id)) tgt.delete(id); });
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      tgt.forEach((p) => { x0 = Math.min(x0, p.x - 66); x1 = Math.max(x1, p.x + 66); y0 = Math.min(y0, p.y - 30); y1 = Math.max(y1, p.y + 52); });
      bbox = { x0, y0, x1, y1 };
    }

    /* Plegar lo ya resuelto: se queda a la vista lo que tiene algo pendiente, en rojo, nuevo o elegido, y el camino hasta ahí. */
    function autoplegar(extra, estricto) {
      const ids = new Set(res.nodos.map((n) => n.id)), hijos = {};
      res.nodos.forEach((n) => { if (n.de && ids.has(n.de)) (hijos[n.de] = hijos[n.de] || []).push(n.id); });
      const base = new Set((extra || []).filter((i) => ids.has(i)));
      const add = (S, i) => { if (i && ids.has(i)) S.add(i); };
      res.abiertas.forEach((i) => add(base, i)); (res.reabiertas || []).forEach((r) => add(base, r.id)); add(base, sel);
      alertasRotas().forEach((a) => { add(base, a.nodo); (a.sobre || []).forEach((i) => add(base, i)); });
      if (ruta) ruta.nodos.forEach((i) => add(base, i));
      const calcula = (nivel) => {      // nivel 0: se queda a la vista todo lo nuevo; 1: solo lo nuevo que se captura; 2: nada de lo nuevo
        const prot = new Set(base);
        res.nodos.forEach((n) => { if (n.marca === 'nuevo' && (nivel === 0 || (nivel === 1 && n.tipo !== 'calculado'))) prot.add(n.id); });
        const A = new Set();
        prot.forEach((i) => { let x = porId(i); while (x && !A.has(x.id)) { A.add(x.id); x = x.de ? porId(x.de) : null; } });
        return new Set(res.nodos.filter((n) => !n.raiz && (hijos[n.id] || []).length && !(hijos[n.id] || []).some((h) => A.has(h))).map((n) => n.id));
      };
      const contarVista = (pl) => { let c = 0; const ocul = (id) => { const n = porId(id); let x = n && n.de ? porId(n.de) : null; while (x) { if (pl.has(x.id)) return true; x = x.de ? porId(x.de) : null; } return false; }; res.nodos.forEach((n) => { if (!ocul(n.id)) c++; }); return c; };
      for (let nv = estricto ? 2 : 0; nv <= 2; nv++) { plegados = calcula(nv); if (nv === 2 || contarVista(plegados) <= 30) break; }
    }
    function desplegarHasta(idsSet) {
      idsSet.forEach((i) => { let x = porId(i); x = x && x.de ? porId(x.de) : null; while (x) { plegados.delete(x.id); x = x.de ? porId(x.de) : null; } });
    }

    /* ----- ruta de la causa ----- */
    function cadena(id) { const c = []; let x = porId(id); while (x) { c.push(x.id); x = x.de ? porId(x.de) : null; } return c; }
    function caminoArbol(a, b) {
      const ca = cadena(a), cb = cadena(b), sb = new Set(cb), lca = ca.find((x) => sb.has(x));
      if (!lca) return [a, b];
      return ca.slice(0, ca.indexOf(lca) + 1).concat(cb.slice(0, cb.indexOf(lca)).reverse());
    }
    function construyeRuta(alertIds, opciones) {
      const al = (res.alertas || []).filter((a) => alertIds.indexOf(a.id) >= 0), r = { alertas: al.map((a) => a.id), nodos: new Set(), aristas: new Set(), duenos: new Set(), ok: !!(opciones && opciones.ok) };
      const camino = (lista) => {
        lista.forEach((x) => r.nodos.add(x));
        for (let i = 0; i < lista.length - 1; i++) { const x = lista[i], y = lista[i + 1], nx = porId(x); r.aristas.add(nx && nx.de === y ? 'de>' + y + '>' + x : 'de>' + x + '>' + y); }
      };
      al.forEach((a) => {
        const dib = (a.ruta || []).filter((x) => porId(x));
        if (!dib.length && porId(a.nodo)) dib.push(a.nodo);
        if (dib.length === 1) r.nodos.add(dib[0]);
        for (let i = 0; i < dib.length - 1; i++) camino(caminoArbol(dib[i], dib[i + 1]));
        if (porId(a.nodo)) { r.duenos.add(a.nodo); r.nodos.add(a.nodo); }
      });
      return r;
    }
    function rutaDeNodo(id) {       // sin alerta: de qué sale (cadena de «de» hasta la raíz, máximo 8)
      const c = cadena(id).slice(0, 8), r = { alertas: [], nodos: new Set(c), aristas: new Set(), duenos: new Set([id]), ok: true };
      for (let i = 0; i < c.length - 1; i++) r.aristas.add('de>' + c[i + 1] + '>' + c[i]);
      return r;
    }
    function mostrarRuta() {
      if (!ruta || !vw) return; remide();
      const al = (res.alertas || []).filter((a) => ruta.alertas.indexOf(a.id) >= 0), a0 = al.find((a) => a.nivel === 'alto') || al[0];
      const prin = a0 ? construyeRuta([a0.id]) : ruta;                 // la cámara sigue la alerta más grave; las demás rutas siguen marcadas
      const b = union([...prin.nodos].map(caja)); if (!b) return;
      const e = encuadra(b, 1, KLEG);
      if (e.fit >= KLEG) moverCam(e.cam, 600);
      else { const d = [...prin.duenos][0]; const p = d && tgt.get(d); if (p) { const k = clamp(Math.max(cam.k, 0.7), KMIN, 0.9); moverCam({ k, x: vw * 0.55 - p.x * k, y: vh * 0.5 - p.y * k }, 600); } }
    }
    function limpiarRuta() { if (!ruta) return; ruta = null; sincroniza(); coloca(); pintaFranja(); }
    function ponerRuta(r, pliega) {
      ruta = r;
      if (r) desplegarHasta(r.nodos);
      pintaTodo(false);
    }

    /* ----- elementos ----- */
    const radio = (n) => n.raiz ? 20 : n.tipo === 'calculado' ? 15 : n.tipo === 'se_decide' ? 14 : 11;
    function creaNodo(n) {
      const r = radio(n);
      const g = svgEl('g', { class: 'nodo', 'data-id': n.id, role: 'button', tabindex: '-1' }, gNo);
      svgEl('rect', { class: 'toca', x: -56, width: 112, y: -(r + 6), height: 2 * r + 46 }, g);
      svgEl('circle', { class: 'foco', r: r + 9 }, g); svgEl('circle', { class: 'halo', r: r + 7 }, g); svgEl('circle', { class: 'sello', r: r + 5 }, g);
      if (n.tipo === 'se_busca' && !n.raiz) svgEl('path', { class: 'forma', d: 'M0,-14 L14,0 L0,14 L-14,0Z' }, g);
      else if (n.tipo === 'regla_oficio') svgEl('path', { class: 'forma', d: 'M12,0 L6,10.4 L-6,10.4 L-12,0 L-6,-10.4 L6,-10.4Z' }, g);
      else svgEl('circle', { class: 'forma', r }, g);
      if (n.tipo === 'calculado') svgEl('circle', { class: 'interior', r: r - 8 }, g);
      if (n.raiz) svgEl('circle', { class: 'pin', r: 7 }, g);
      svgEl('path', { class: 'check', d: n.tipo === 'se_busca' ? 'M-4,0 L-1,3.4 L4.2,-3.4' : 'M-5,0 L-1.5,4 L5,-4' }, g);
      svgEl('text', { class: 'g', y: 5.5 }, g);
      svgEl('text', { class: 't', y: r + 16 }, g); svgEl('text', { class: 'v', y: r + 30 }, g);
      const ins = svgEl('g', { class: 'ins', transform: 'translate(' + (r * 0.8) + ',' + (-r * 0.8) + ')' }, g);
      svgEl('circle', { r: 8 }, ins); svgEl('text', { y: 4.5 }, ins).textContent = '!';
      svgEl('path', { d: ESTRELLA_D }, svgEl('g', { class: 'estr', transform: 'translate(' + (-(r * 0.8) - 2).toFixed(1) + ',' + (-(r * 0.8) - 1).toFixed(1) + ')', 'aria-hidden': 'true' }, g));
      const p = svgEl('g', { class: 'plie', 'data-fold': n.id, role: 'presentation' }, g);
      svgEl('circle', { class: 'zona', r: 17 }, p); svgEl('rect', { class: 'fondo', rx: 9, ry: 9, height: 18, y: -9 }, p); svgEl('text', { y: 4 }, p);
      elems.set(n.id, { g, r, plie: p });
      return g;
    }
    const textoValor = (n) => {
      if (n.raiz) return fmt(n.valor_vista, n.unidad);
      if (n.tipo === 'se_decide') {
        if (n.estado == null) return 'tú decides';
        if (n.estado === 'reabierto') return 'se reabrió';
        if (n.estado === 'decidido' && n.opcion === 'personalizado') return 'personalizado · ' + fmt(n.valor_vista, n.unidad);
        if (n.estado === 'decidido' && n.opcion) { const o = n.opciones.find((x) => x.clave === n.opcion); if (o) return o.nombre; }
      }
      return fmt(n.valor_vista, n.unidad);
    };
    function etiquetaNodo(n) {
      const h = (hijosDe[n.id] || []).length;
      let s = n.titulo + '. ' + TIPO_TXT[n.tipo] + '. ' + (n.estado == null ? (n.tipo === 'calculado' ? (n.heredado === 'firme' ? 'firme' : 'estimado') : 'te toca decidir') : ESTADO_TXT[n.estado]) + '. ' + textoValor(n) + '.';
      if (esRojo(n)) s += ' En rojo: no pasa.';
      if (n.estrella) s += ' Alimenta la presentación: ' + ESTRELLA_TXT[n.estrella] + '.';
      if (h) s += plegados.has(n.id) ? ' Rama plegada, ' + ocultosPlie[n.id] + ' nodos ocultos.' : ' Rama desplegada.';
      return s;
    }
    function claseEstado(n) {
      if (n.raiz) return 'raiz e-conf';
      if (n.tipo === 'calculado') return n.heredado === 'firme' ? 'e-calc' : 'e-calc est';
      return { referencia: 'e-ref', no_se: 'e-nose', decidido: 'e-dec', confirmado: 'e-conf', reabierto: 'e-reab' }[n.estado] || 'e-abierta';
    }
    function sincroniza() {
      const vis = new Set(visibles.map((n) => n.id));
      elems.forEach((e, id) => { if (!vis.has(id)) { e.g.remove(); elems.delete(id); disp.delete(id); } });
      lienzo.toggleAttribute('data-ruta', !!ruta);
      visibles.forEach((n) => {
        let e = elems.get(n.id);
        const nuevoEl = !e; if (nuevoEl) { creaNodo(n); e = elems.get(n.id); }
        const g = e.g, rojo = esRojo(n), ambar = esAmbar(n);
        g.setAttribute('class', 'nodo t-' + n.tipo + ' ' + claseEstado(n) + (n.id === sel ? ' sel' : '') + (n.marca === 'nuevo' ? ' nuevo' : '') + (n.marca === 'cambio' ? ' cambio' : '') + (plegados.has(n.id) ? ' plegado' : '') + (rojo ? ' rojo' : '') + (ambar ? ' ambar' : '') + (ruta && ruta.nodos.has(n.id) ? ' enruta' : '') + (ruta && ruta.duenos.has(n.id) ? ' dueno' : ''));
        g.style.setProperty('--c', colorDe(n));
        g.setAttribute('aria-label', etiquetaNodo(n));
        g.setAttribute('tabindex', n.id === sel ? '0' : '-1');
        g.querySelector('text.t').textContent = corto(n.titulo, 17);
        g.querySelector('text.v').textContent = corto(textoValor(n), 19);
        g.querySelector('text.g').textContent = n.estado === 'reabierto' ? '!' : (n.tipo === 'se_decide' && n.estado == null) ? '?' : n.estado === 'no_se' ? '≈' : '';
        const es = g.querySelector('.estr'); if (es) es.setAttribute('class', 'estr' + (n.estrella ? ' ' + n.estrella : ''));
        const hs = (hijosDe[n.id] || []).length, p = e.plie;
        p.style.display = hs ? '' : 'none';
        if (hs) {
          const plg = plegados.has(n.id), tx = plg ? '+' + ocultosPlie[n.id] : '−', w = plg ? 8 + String(tx).length * 7 : 18;
          const rect = p.querySelector('rect'); rect.setAttribute('width', w); rect.setAttribute('x', -9);
          p.querySelector('text').setAttribute('x', w / 2 - 9); p.querySelector('text').textContent = tx;
          p.setAttribute('transform', 'translate(' + (e.r + 16) + ',0)');
          p.setAttribute('aria-hidden', 'true');
          p.querySelector('.zona').setAttribute('cx', w / 2 - 9);
        }
        if (nuevoEl) { const par = disp.get(n.de) || tgt.get(n.de) || tgt.get(n.id); const t = tgt.get(n.id); disp.set(n.id, reducido() ? { x: t.x, y: t.y } : { x: par.x, y: par.y }); }
      });
      // aristas
      const quiero = new Set();
      visibles.forEach((n) => {
        if (n.de && vis.has(n.de)) quiero.add('de>' + n.de + '>' + n.id);
        (n.usa || []).forEach((u) => { if (vis.has(u)) quiero.add('usa>' + u + '>' + n.id); });
      });
      aristas.forEach((el, k) => { if (!quiero.has(k)) { el.remove(); aristas.delete(k); } });
      quiero.forEach((k) => { if (!aristas.has(k)) { const [tipo, a, b] = k.split('>'); aristas.set(k, svgEl('path', { class: 'arista' + (tipo === 'usa' ? ' usa' : ''), 'data-a': a, 'data-b': b }, gAr)); } });
      const tenues = new Set();      // las líneas de las demás alertas, en rojo tenue, mientras una ruta está marcada
      if (ruta && !ruta.ok) { const otras = alertasRotas().filter((a) => ruta.alertas.indexOf(a.id) < 0).map((a) => a.id); if (otras.length) construyeRuta(otras).aristas.forEach((k) => tenues.add(k)); }
      aristas.forEach((el, k) => {
        const en = !!(ruta && ruta.aristas.has(k)), tn = !en && tenues.has(k), clase = 'arista' + (k.indexOf('usa>') === 0 ? ' usa' : '') + (en ? ' ruta' + (ruta.ok ? ' ok' : '') : '') + (tn ? ' tenue' : '');
        if (el.getAttribute('class') !== clase) el.setAttribute('class', clase);
        if (en || tn) gAr.appendChild(el);
      });
      if (sel && elems.get(sel) && gNo.lastChild !== elems.get(sel).g) { const f = document.activeElement, g = elems.get(sel).g, tenia = f && g.contains(f); gNo.appendChild(g); if (tenia) g.focus({ preventScroll: true }); }
    }
    function coloca() {
      elems.forEach((e, id) => { const p = disp.get(id); if (p) e.g.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')'); });
      aristas.forEach((el) => {
        const a = disp.get(el.getAttribute('data-a')), b = disp.get(el.getAttribute('data-b')); if (!a || !b) return;
        const mx = (a.x + b.x) / 2; el.setAttribute('d', 'M' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + ' C' + mx.toFixed(1) + ',' + a.y.toFixed(1) + ' ' + mx.toFixed(1) + ',' + b.y.toFixed(1) + ' ' + b.x.toFixed(1) + ',' + b.y.toFixed(1));
      });
    }

    /* el lienzo cambia de alto cuando sale o se quita la franja de alertas: se vuelve a medir antes de mover la cámara */
    function remide() {
      const r = lienzo.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;     // lienzo escondido (se está viendo la comparación): se conserva la medida anterior
      vw = Math.max(1, r.width); vh = Math.max(1, r.height);
      svg.setAttribute('viewBox', '0 0 ' + vw.toFixed(0) + ' ' + vh.toFixed(0));
      return true;
    }

    /* ----- cámara ----- */
    function aplicaCam() {
      mundo.setAttribute('transform', 'translate(' + cam.x.toFixed(2) + ',' + cam.y.toFixed(2) + ') scale(' + cam.k.toFixed(4) + ')');
      lienzo.setAttribute('data-z', cam.k < 0.34 ? 'muylejos' : cam.k < 0.5 ? 'lejos' : 'cerca');
    }
    function acota(c) {
      const m = Math.min(90, vw * 0.3, vh * 0.3);      // margen de contenido que siempre queda a la vista; en un lienzo bajo (84 px) 90 invertía el rango y la cámara «brincaba»
      c.k = clamp(c.k, KMIN, KMAX);
      c.x = clamp(c.x, m - bbox.x1 * c.k, vw - m - bbox.x0 * c.k);
      c.y = clamp(c.y, m - bbox.y1 * c.k, vh - m - bbox.y0 * c.k);
      return c;
    }
    function pon(c) { cam = acota(c); aplicaCam(); }
    function moverCam(a, ms) {
      a = acota({ x: a.x, y: a.y, k: a.k });
      if (reducido() || !ms) { anim.cam = null; pon(a); return; }
      anim.cam = { t0: performance.now(), ms, de: { x: cam.x, y: cam.y, k: cam.k }, a }; pide();
    }
    function zoomEn(sx, sy, f, base) {
      const c = base || cam, k2 = clamp(c.k * f, KMIN, KMAX), r = k2 / c.k;
      return { x: sx - (sx - c.x) * r, y: sy - (sy - c.y) * r, k: k2 };
    }
    function caja(id) { const p = tgt.get(id); return p ? { x0: p.x - 62, x1: p.x + 62, y0: p.y - 26, y1: p.y + 50 } : null; }
    const union = (cs) => cs.filter(Boolean).reduce((a, c) => a ? { x0: Math.min(a.x0, c.x0), x1: Math.max(a.x1, c.x1), y0: Math.min(a.y0, c.y0), y1: Math.max(a.y1, c.y1) } : c, null);
    const ctrlEl = $('.ppp-ctrl');
    const ctrlFila = () => getComputedStyle(ctrlEl).flexDirection === 'row';           // en celulares bajos los botones de zoom van en una fila abajo, no en columna
    const bandaCtrl = () => ctrlFila() ? ctrlEl.offsetHeight + 8 : 0;
    const PAD = () => ctrlFila() ? ({ l: 14, r: 14, t: 18, b: 18 + bandaCtrl() }) : ({ l: 22, r: 58, t: 22, b: 22 });          // derecha: columna de zoom (o abajo: fila de zoom)
    function encuadra(b, kmax, kmin, pad) {
      const pd = pad || PAD(), aw = vw - pd.l - pd.r, ah = vh - pd.t - pd.b, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
      const fit = Math.min(aw / bw, ah / bh);
      const k = clamp(fit, kmin, kmax);
      return { fit, cam: { k, x: pd.l + aw / 2 - ((b.x0 + b.x1) / 2) * k, y: pd.t + ah / 2 - ((b.y0 + b.y1) / 2) * k } };
    }
    /* Seguir la rama nueva: deja a la vista el nodo nuevo y la siguiente decisión con el menor movimiento posible. */
    function seguir(ids, primero, contestado) {
      if (!vw) return; remide();
      const pd = PAD(), aw = vw - pd.l - pd.r, ah = vh - pd.t - pd.b;
      const d2 = (a, b) => { const p = tgt.get(a), q = tgt.get(b); return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 1e9; };
      const cerca = ids.filter((i) => i !== primero).sort((a, b) => d2(a, primero) - d2(b, primero))[0];
      const juegos = [[contestado].concat(ids, [primero]), ids.concat([primero]), [contestado, cerca, primero], [cerca, primero], [contestado, primero], [primero]]
        .map((j) => union(j.filter(Boolean).map(caja))).filter(Boolean);
      let elegido = null, fit = 1;
      for (const b of juegos) { const f = Math.min(aw / (b.x1 - b.x0), ah / (b.y1 - b.y0)); if (f >= KSEG) { elegido = b; fit = f; break; } }
      if (!elegido) { elegido = juegos[juegos.length - 1]; fit = KSEG; }
      const k = clamp(cam.k, KSEG, Math.max(KSEG, Math.min(fit, 1.4)));
      const sx0 = elegido.x0 * cam.k + cam.x, sx1 = elegido.x1 * cam.k + cam.x, sy0 = elegido.y0 * cam.k + cam.y, sy1 = elegido.y1 * cam.k + cam.y;
      if (cam.k >= KSEG && sx0 >= pd.l && sx1 <= vw - pd.r && sy0 >= pd.t && sy1 <= vh - pd.b) return;
      moverCam({ k, x: pd.l + aw / 2 - ((elegido.x0 + elegido.x1) / 2) * k, y: pd.t + ah / 2 - ((elegido.y0 + elegido.y1) / 2) * k }, 650);
    }
    /* «Ver todo»: pliega lo ya resuelto y encuadra. Si el árbol abierto no cabe con letra legible (en 398 px caben unas 4 columnas a letra legible),
       encuadra lo que importa —decisiones abiertas, alertas, ruta, lo elegido— con el zoom legible y deja el resto a un pellizco de distancia. */
    function verTodo(ms) {
      remide();
      const b = union([...tgt.keys()].map(caja)); if (!b) return;
      const e = encuadra(b, 1.1, KMIN);
      if (e.fit >= KLEG) { moverCam(e.cam, ms == null ? 450 : ms); return; }
      const imp = []; const mete = (id) => { if (id && tgt.has(id) && imp.indexOf(id) < 0) imp.push(id); };
      res.abiertas.forEach(mete); alertasRotas().forEach((a) => mete(a.nodo)); if (ruta) ruta.duenos.forEach(mete); mete(sel);
      const raiz = res.nodos.find((n) => n.raiz); if (!imp.length && raiz) mete(raiz.id);
      let acc = null;
      imp.forEach((id) => {
        const n = porId(id), solo = caja(id), cand = union([acc, solo, n && n.de ? caja(n.de) : null]);
        const cabe = encuadra(cand, 1, KLEG).fit >= KLEG;
        if (!acc) acc = cabe ? cand : solo;       // en un lienzo bajo, el dato y su origen pueden quedar tan lejos que centrados en medio no se verían: se prefiere el dato
        else if (cabe) acc = cand;
      });
      moverCam(encuadra(acc || b, 1.1, KLEG).cam, ms == null ? 450 : ms);
    }
    function vistaInicial() {
      const todo = union([...tgt.keys()].map(caja)), e = todo && encuadra(todo, 1, KSEG);
      if (e && e.fit >= KSEG) { moverCam(e.cam, 0); return; }
      // el árbol completo no cabe con letra legible: primero el predio y la primera decisión; si tampoco, la decisión y las dos bolitas de las que cuelga
      const a = res.abiertas[0], raiz = res.nodos.find((n) => n.raiz), pad = { l: 12, r: PAD().r, t: 22, b: PAD().b };
      const par = union([raiz && raiz.id, a].filter(Boolean).map(caja)), e2 = par && encuadra(par, 1, KSEG, pad);
      if (e2 && e2.fit >= 0.57) { moverCam(e2.cam, 0); return; }
      const cad = a ? cadena(a).slice(0, 3) : [], cerca = union(cad.map(caja)), e3 = cerca && encuadra(cerca, 1, KSEG, pad);
      if (e3) moverCam(e3.cam, 0); else if (e2) moverCam(e2.cam, 0);
    }
    function centrar(id) {
      const p = tgt.get(id); if (!p) return; remide();
      const k = clamp(Math.max(cam.k, 0.95), KMIN, 1.6), libre = vh - bandaCtrl();
      moverCam({ k, x: vw / 2 - p.x * k, y: libre * 0.45 - (p.y + 14) * k }, 420);
    }
    function asegurar(id) {      // lleva a la vista un nodo con el menor movimiento
      const p = tgt.get(id) || disp.get(id), pd = PAD(); if (!p) return; remide();
      const sx = p.x * cam.k + cam.x, sy = p.y * cam.k + cam.y; let dx = 0, dy = 0;
      if (sx < pd.l + 40) dx = pd.l + 40 - sx; else if (sx > vw - pd.r - 40) dx = vw - pd.r - 40 - sx;
      if (sy < pd.t + 20) dy = pd.t + 20 - sy; else if (sy > vh - pd.b) dy = vh - pd.b - sy;
      if (dx || dy) moverCam({ k: cam.k, x: cam.x + dx, y: cam.y + dy }, 250);
    }

    /* ----- animación (cámara y posiciones comparten un solo bucle; solo corre mientras algo se mueve) ----- */
    function pide() { if (!raf) raf = requestAnimationFrame(tick); }
    function tick(t) {
      raf = 0; let sigue = false;
      if (anim.cam) {
        const a = anim.cam, p = clamp((t - a.t0) / a.ms, 0, 1), e = ease(p);
        cam = { x: a.de.x + (a.a.x - a.de.x) * e, y: a.de.y + (a.a.y - a.de.y) * e, k: a.de.k + (a.a.k - a.de.k) * e }; aplicaCam();
        if (p >= 1) { cam = acota({ x: a.a.x, y: a.a.y, k: a.a.k }); aplicaCam(); anim.cam = null; } else sigue = true;
      }
      if (anim.lay) {
        const a = anim.lay, p = clamp((t - a.t0) / a.ms, 0, 1), e = ease(p);
        tgt.forEach((to, id) => { const f = desde.get(id) || to; disp.set(id, { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e }); });
        coloca(); if (p >= 1) anim.lay = null; else sigue = true;
      }
      if (sigue) pide();
    }
    function mueveNodos() {
      desde.clear(); disp.forEach((p, id) => desde.set(id, { x: p.x, y: p.y }));
      if (reducido()) { tgt.forEach((p, id) => disp.set(id, { x: p.x, y: p.y })); anim.lay = null; coloca(); return; }
      anim.lay = { t0: performance.now(), ms: 520 }; pide();
    }

    /* ───────────── panel inferior ───────────── */
    const chip = (txt, cls) => '<span class="chip ' + (cls || '') + '">' + esc(txt) + '</span>';
    const boton = (a, k, html, cls, extra) => '<button type="button" class="' + (cls || '') + '" data-a="' + esc(a) + '"' + (k ? ' data-k="' + esc(k) + '"' : '') + (extra || '') + '>' + html + '</button>';

    function partesSug(s) {
      let t = sinIds(s.texto || ''), aviso = null, cierre = 'La alerta se apaga';
      const m = t.match(/^(.*?)\s+y (la prueba pasa|la alerta se apaga)(?:, pero (.*?))?\.?$/);
      if (m) { t = m[1]; cierre = m[2] === 'la prueba pasa' ? 'La prueba pasa' : 'La alerta se apaga'; aviso = m[3] || null; }
      return { t: t.replace(/\.$/, ''), aviso, cierre };
    }
    function textoMedida(a) {
      const m = a.medida, n = porId(a.nodo); if (!m || m.valor == null || !n) return '';
      const igual = a.nodo.indexOf('RV-') === 0 || ['pct', 'mes', 'n', 'm2', 'veces', 'u_mes'].indexOf(n.unidad.clase) >= 0;   // el motor aún no dice la unidad de la medida: solo se da unidad cuando es la del nodo
      const f = (v) => igual ? fmt(aVista(n, v), n.unidad) : nf(v, Math.abs(v) < 100 ? 1 : 0), cmp = m.pasa_si === '>=' ? 'al menos' : m.pasa_si === '<=' ? 'como máximo' : 'meta';
      return 'Ahora ' + f(m.valor) + ' · pide ' + cmp + ' ' + f(m.meta);
    }
    function htmlAlertaCaja(a) {
      const alto = a.nivel === 'alto', activa = ruta && ruta.alertas.indexOf(a.id) >= 0;
      let h = '<section class="alerta-caja ' + (alto ? 'alto' : 'aviso') + '" aria-label="' + (alto ? 'No pasa' : 'Ojo') + '"><p class="al-t"><span class="al-i" aria-hidden="true">!</span><span><strong>' + (alto ? 'No pasa.' : 'Ojo.') + '</strong> ' + esc(sinIds(a.texto)) + '</span></p>';
      const med = textoMedida(a); if (med) h += '<p class="al-m">' + esc(med) + '</p>';
      if (!activa && (a.ruta || []).length) h += '<div class="fila">' + boton('ruta:' + a.id, 'ruta-' + a.id, 'Ver la ruta de la causa', 'ppp-btn chico') + '</div>';
      const sg = a.sugerencias || [];
      if (sg.length) {
        h += '<h3>Cómo corregirlo <small>(calculado por el motor; un toque lo aplica)</small></h3><div class="sugs">' + sg.map((s, i) => {
          const p = partesSug(s), col = (s.colaterales || []).length;
          return boton('sug:' + a.id + ':' + i, 'sug-' + a.id + '-' + i, '<b>' + esc(p.t) + '</b>' + (p.aviso ? '<small class="warn">Pero ' + esc(p.aviso) + '</small>' : '<small class="pasa">' + esc(p.cierre) + '</small>'), 'sug' + (col ? ' costo' : ''));
        }).join('') + '</div>' + (a.no_mostradas ? '<p class="nota">Hay ' + a.no_mostradas + ' ajuste' + (a.no_mostradas === 1 ? '' : 's') + ' más que también sirve' + (a.no_mostradas === 1 ? '' : 'n') + '.</p>' : '');
      } else if (a.estado_sugerencias && a.estado_sugerencias !== 'diferidas') h += '<p class="nota">El motor no encontró un ajuste simple. Revisa los datos que alimentan esto (la ruta marca cuáles).</p>';
      return h + '</section>';
    }
    function htmlAlertas(n) {
      const mias = alertasDe(n.id); let h = '';
      mias.filter((a) => a.nivel !== 'info').forEach((a) => { h += htmlAlertaCaja(a); });
      mias.filter((a) => a.nivel === 'info').forEach((a) => { h += '<p class="aviso info" role="status">' + esc(sinIds(a.texto)) + '</p>'; });
      const afecta = alertasRotas().filter((a) => a.nodo !== n.id && (a.ruta || []).indexOf(n.id) >= 0);
      if (afecta.length) {
        const vistos = new Set();
        h += '<div class="afecta"><span>Esto está afectando a:</span>' + afecta.filter((a) => !vistos.has(a.nodo) && vistos.add(a.nodo)).map((a) => boton('alerta:' + a.id, 'afecta-' + a.id, '<i aria-hidden="true">!</i>' + esc(corto(tituloDe(a.nodo), 26)), 'fr-chip ' + (a.nivel === 'alto' ? 'alto' : 'aviso'))).join('') + '</div>';
      }
      (n.notas || []).filter((t) => !mias.some((a) => a.texto === t)).forEach((t) => { h += '<p class="aviso info" role="status">' + esc(sinIds(t)) + '</p>'; });      // la nota del ajuste de la referencia y su alerta dicen lo mismo: se muestra una sola vez
      ultimosErrores.filter((e) => !e.id || e.id === n.id).forEach((e) => { h += '<p class="aviso" role="status">' + esc(sinIds(e.mensaje)) + '</p>'; });
      const re = (res.reabiertas || []).find((x) => x.id === n.id); if (re) h = '<p class="aviso" role="status">' + esc(sinIds(re.motivo)) + '</p>' + h;
      return h;
    }
    function htmlEfecto() {
      if (!efecto) return '<div data-efecto></div>';
      const btn = efecto.regla ? (cambiosRegla.length ? boton('rgundo:' + (cambiosRegla.length - 1), 'rgundo-ultimo', 'Deshacer', 'ppp-btn chico') : '') : (historia.length || cierreVivo() ? boton('deshacer', 'deshacer', 'Deshacer', 'ppp-btn chico') : '');
      return '<div class="efecto" data-efecto role="status"><span><strong>' + esc(efecto.titulo) + '</strong>' + (efecto.partes.length ? ' · ' + efecto.partes.map(esc).join(' · ') : '') + '</span>' + btn + '</div>';
    }
    const antesTxt = (n) => n.marca === 'cambio' && n.antes != null ? '<small>antes ' + esc(fmt(aVista(n, n.antes), n.unidad)) + '</small>' : '';

    /* campo numérico con − / + y rango; todo en unidades de lo que la persona ve (porcentaje entero, millones…) */
    function htmlEditorNum(n, etiqueta, valorActual) {
      if (n.unidad.clase === 'texto' || n.unidad.clase === 'si_no' || typeof n.valor_vista !== 'number' && !n.rango) return '';
      const conRango = !!(n.rango && n.rango.min != null && n.rango.max != null), vv = typeof valorActual === 'number' ? valorActual : n.valor_vista;
      const rg = conRango ? n.rango : { min: 0, max: null, paso: Math.abs(vv) >= 1000 ? 10 : Math.abs(vv) >= 100 ? 1 : 0.1 };
      const k = n.unidad.clase === 'pct' ? 100 : 1, v = vv, paso = (rg.paso || (rg.max - rg.min) / 100) * k;
      return '<div class="edit" data-edit="' + esc(n.id) + '"><label for="ppp-otro">' + esc(etiqueta) + '</label><div class="step">' +
        boton('step:-1', 'menos', '−', 'sb', ' aria-label="Bajar un paso"') +
        '<input id="ppp-otro" data-k="campo" type="number" inputmode="decimal" min="' + redondea(rg.min * k, 4) + '"' + (conRango ? ' max="' + redondea(rg.max * k, 4) + '"' : '') + ' step="any" value="' + (typeof v === 'number' ? redondea(v * k, 4) : '') + '" aria-label="' + esc(etiqueta) + ' en ' + esc(n.unidad.etiqueta) + '">' +
        boton('step:1', 'mas', '+', 'sb', ' aria-label="Subir un paso"') + '<span class="u">' + esc(n.unidad.etiqueta) + '</span></div>' +
        (conRango ? '<input type="range" data-k="rango" min="' + redondea(rg.min * k, 4) + '" max="' + redondea(rg.max * k, 4) + '" step="' + redondea(paso, 6) + '" value="' + (typeof v === 'number' ? redondea(clamp(v * k, rg.min * k, rg.max * k), 4) : redondea(rg.min * k, 4)) + '" aria-label="Rango de ' + esc(n.titulo) + '">' +
        '<p class="nota rango"><span>' + esc(fmt(rg.min, n.unidad)) + '</span><span>Rango razonable</span><span>' + esc(fmt(rg.max, n.unidad)) + '</span></p>' : '<p class="nota">Sin rango definido: escribe el valor o ajústalo con − / +.</p>') + '</div>';
    }
    function htmlFuentes(n) {
      if (!n.fuentes || !n.fuentes.length) return '';
      return '<div class="fuentes" role="group" aria-label="Fuentes del dato"><h3>Elige la fuente <small>(cada una dice de dónde sale)</small></h3>' + n.fuentes.map((f) => {
        const on = n.opcion === f.clave;
        return boton('fuente:' + f.clave, 'fte-' + f.clave, '<span class="fv">' + esc(fmt(aVista(n, f.valor), n.unidad)) + '</span><span class="ft"><b>' + esc(f.nombre) + '</b><small>' + esc(corto(f.fuente, 110)) + '</small></span><em>' + [on ? (n.estado === 'decidido' ? 'elegida' : 'en uso') : f.por_omision ? 'por omisión' : '', f.ajustada ? 'ajustada al ' + (f.ajustada === 'maximo' ? 'máximo' : 'mínimo') : ''].filter(Boolean).join(' · ') + '</em>', 'fte' + (on ? ' on' : ''), ' aria-pressed="' + on + '"');
      }).join('') + '</div>';
    }

    /* decisión C: cada prueba lleva su umbral como dato del plan (RU-01 a RU-09; la zona «justa» de la 4 es RU-10). Por omisión vale el del libro; si el plan escribe otro, se marca. */
    const umbralesDe = (i) => { const lib = (motor.PRUEBAS_LIBRO || []).find((q) => q.id === i.id) || {}; return [lib.ru, lib.ruJusta].filter(Boolean).map(porId).filter(Boolean); };
    function htmlUmbral(i) {
      const nus = umbralesDe(i); if (!nus.length) return '';
      const abierto = umbralAbierto.has(i.id), propio = !!i.umbral_propio || nus.some((x) => x.estado && x.estado !== 'referencia');
      let h = '<details class="umbral' + (i.umbral_propio ? ' propio' : '') + '" data-u="' + esc(i.id) + '"' + (abierto ? ' open' : '') + '><summary data-k="um-sum-' + esc(i.id) + '">' + (i.umbral_propio ? 'Umbral propio' : 'Umbral') + ': ' + esc(i.umbral_texto || '') + ' · <u>cambiar</u></summary><div class="um-cuerpo">';
      nus.forEach((nu, j) => {
        const k = nu.unidad.clase === 'pct' ? 100 : 1, rg = nu.rango || {}, v = typeof nu.valor_vista === 'number' ? nu.valor_vista * k : '', et = nu.unidad.etiqueta || '', paso = (rg.paso || 1) * k;
        const etq = j === 0 ? 'Esta prueba pide (en ' + et + ')' : 'Hasta dónde cuenta como «justa» (en ' + et + ')';
        h += '<div class="edit um-ed"><label for="ppp-um-' + esc(nu.id) + '">' + esc(etq) + '</label><div class="step">' +
          boton('umstep:' + nu.id + ':-1', 'um-menos-' + nu.id, '−', 'sb', ' aria-label="Bajar un paso"') +
          '<input id="ppp-um-' + esc(nu.id) + '" data-k="um-' + esc(nu.id) + '" data-ru="' + esc(nu.id) + '" type="number" inputmode="decimal" min="' + (rg.min != null ? redondea(rg.min * k, 4) : 0) + '"' + (rg.max != null ? ' max="' + redondea(rg.max * k, 4) + '"' : '') + ' step="any" value="' + (v === '' ? '' : redondea(v, 4)) + '" aria-label="' + esc(etq) + '">' +
          boton('umstep:' + nu.id + ':1', 'um-mas-' + nu.id, '+', 'sb', ' aria-label="Subir un paso"') + '<span class="u">' + esc(et) + '</span></div>' +
          '<p class="nota">El libro pide ' + esc(fmt(aVista(nu, nu.referencia && nu.referencia.valor != null ? nu.referencia.valor : nu.valor), nu.unidad)) + (rg.min != null ? ' · se admite de ' + esc(fmt(aVista(nu, rg.min), nu.unidad)) + ' a ' + esc(fmt(aVista(nu, rg.max), nu.unidad)) : '') + '.</p>' +
          (nu.estado && nu.estado !== 'referencia' ? '<div class="fila">' + boton('umlibro:' + nu.id, 'um-libro-' + nu.id, 'Volver al del libro', 'ppp-btn') + '</div>' : '') + '</div>';
      });
      return h + '</div></details>';
    }
    function panelPruebas() {
      const items = res.pruebas.items || [];
      let h = '<h2 tabindex="-1" data-foco>Riesgo y estado ' + chip(res.pruebas.resultado, /^No pasa/.test(res.pruebas.resultado) ? 'rojo' : '') + '</h2>' + htmlEfecto() + ultimosErrores.filter((x) => /^RU-\d\d$/.test(x.id || '')).map((x) => '<p class="aviso" role="status">' + esc(sinIds(x.mensaje)) + '</p>').join('') +
        '<p class="nota">Las 9 pruebas de «revisión para fondos». Toca una para ver de qué sale (se marca la ruta en el árbol). Cada una pide lo que dice el libro; si tu banco o inversionista pide otra cosa, cambia su umbral y todo se recalcula: alertas, ruta y sugerencias.</p><ul class="pruebas">';
      items.forEach((i) => {
        const n = porId(i.id), val = n && i.valor != null ? fmt(aVista(n, i.valor), n.unidad) : null;
        const pide = i.umbral_texto ? 'pide ' + i.umbral_texto : (n && i.umbral != null ? (i.pasa_si === '>=' ? 'pide al menos ' : 'pide como máximo ') + fmt(aVista(n, i.umbral), n.unidad) : '');
        const est = i.estado === 'ok' ? 'Pasa' : i.estado === 'fuera' ? 'No pasa' : 'No aplica';
        h += '<li class="pr-i' + (i.umbral_propio ? ' propio' : '') + '">' + boton('prueba:' + i.id, 'prueba-' + i.id, '<span class="pi ' + i.estado + '" aria-hidden="true">' + (i.estado === 'ok' ? '✓' : i.estado === 'fuera' ? '✗' : '–') + '</span><span class="pt"><b>' + esc(i.etiqueta) + '</b><small>' + esc(i.estado === 'na' ? (MOTIVO_NA[i.motivo] || String(i.motivo || '').replace(/_/g, ' ')) : (val ? val + ' · ' : '') + pide) + '</small>' + (i.umbral_propio && i.nota ? '<small class="marca">' + esc(i.nota) + '</small>' : '') + '</span><em class="' + i.estado + '">' + est + '</em>', 'prueba ' + i.estado, ' aria-label="' + esc(i.etiqueta + ': ' + est + (i.umbral_propio && i.nota ? '. ' + i.nota : '')) + '"') + htmlUmbral(i) + '</li>';
      });
      return h + '</ul>' + (res.pruebas.items.some((i) => i.estado === 'fuera') ? '<p class="nota">En rojo: lo que no pasa. Toca la prueba para ver cómo corregirlo.</p>' : '');
    }
    function aplicaUmbral(id, vDisp, tecl) {
      const nu = porId(id); if (!nu) return;
      if (vDisp == null) { ultimosErrores = [{ codigo: 'fuera_de_rango', id, mensaje: 'Escribe un número.' }]; panel(); return; }
      const k = nu.unidad.clase === 'pct' ? 100 : 1, rg = nu.rango || {}; let v = vDisp / k; const crudo = v;
      if (rg.min != null) v = Math.max(rg.min, v); if (rg.max != null) v = Math.min(rg.max, v);
      v = redondea(v, 8);
      decide(id, { [id]: { valor: v, estado: 'decidido' } }, { teclado: tecl, vista: 'pruebas', titulo: 'Umbral propio: ' + nu.titulo.replace(/^Umbral de /i, '').replace(/^(la )?prueba \d+: /i, '') + ' → ' + fmt(aVista(nu, v), nu.unidad) });
      if (Math.abs(crudo - v) > 1e-9) { ultimosErrores = [{ codigo: 'fuera_de_rango', id, mensaje: 'Ese valor queda fuera de lo que se admite; se ajustó a ' + fmt(aVista(nu, v), nu.unidad) + '.' }]; panel(); }
    }

    function panelDecide(n) {
      const estado = n.estado == null ? chip('Tú decides') : n.estado === 'reabierto' ? chip('Se reabrió', 'alerta') : n.estado === 'no_se' ? chip('Pendiente · con referencia', 'punteado') : n.opcion === 'personalizado' ? chip('Personalizado', 'punteado') : chip('Decidido');
      let h = '<h2 tabindex="-1" data-foco>' + esc(n.pregunta || n.titulo) + ' ' + estado + '</h2>' + htmlAlertas(n);
      const compuesto = n.componentes && n.componentes.length;
      if ((compuesto || n.marca === 'cambio') && n.valor_vista != null) h += '<div class="grande" data-grande>' + esc(fmt(n.valor_vista, n.unidad)) + ' <small>' + esc(n.etiqueta_resultado || '') + '</small>' + antesTxt(n) + '</div>';
      h += htmlEfecto();
      h += '<div class="ops" role="group" aria-label="' + (compuesto ? 'Preajustes' : 'Opciones') + '">' + n.opciones.map((o) => {
        const on = n.estado === 'decidido' && n.opcion === o.clave;
        return '<button type="button" class="op ' + (on ? 'on' : '') + '" data-a="op:' + esc(o.clave) + '" data-k="op-' + esc(o.clave) + '" aria-pressed="' + on + '"' + (o.disponible === false ? ' disabled' : '') + '>' +
          '<b>' + esc(o.nombre) + '</b><small>' + esc(o.disponible === false ? (o.motivo || 'Ahora no aplica') : o.implica) + '</small>' + (o.valor != null ? '<i>' + esc(fmt(o.valor, n.unidad)) + ' ' + esc(n.etiqueta_resultado || '') + '</i>' : '') + '</button>';
      }).join('') + '</div>';
      if (compuesto) h += htmlComponentes(n);
      else if (n.permite_otro) h += htmlEditorNum(n, 'Otro valor');
      h += htmlCompararCon(n);
      h += '<div class="fila"><button type="button" class="ppp-btn nose" data-a="nose" data-k="nose">No sé todavía</button><span>usa ' + esc(n.referencia && n.referencia.valor != null ? fmt(n.referencia.valor, n.unidad) : fmt(n.valor_vista, n.unidad)) + ' y lo deja pendiente</span></div>';
      return h + '<p class="nota">' + esc(sinIds(n.que_es)) + '</p>';
    }

    /* «Comparar con esta opción»: abre B con esa sola diferencia (A queda como está ahora) */
    function etiquetaActual(n) {
      if (n.tipo === 'se_decide' && n.opcion && n.opcion !== 'personalizado') { const o = n.opciones.find((x) => x.clave === n.opcion); if (o) return o.nombre; }
      if ((n.fuentes || []).length && n.opcion) { const f = n.fuentes.find((x) => x.clave === n.opcion); if (f) return f.nombre + ' (' + fmt(aVista(n, f.valor), n.unidad) + ')'; }
      return textoValor(n);
    }
    function htmlCompararCon(n) {
      if (cmp || n.estado == null || n.estado === 'reabierto') return '';
      const deFuentes = !(n.opciones || []).length && (n.fuentes || []).length > 1;      // un dato con varias fuentes: se compara con la otra fuente
      const otras = deFuentes ? n.fuentes.filter((f) => f.clave !== n.opcion).map((f) => ({ clave: f.clave, nombre: f.nombre + ' (' + fmt(aVista(n, f.valor), n.unidad) + ')', disponible: true }))
        : (n.opciones || []).filter((o) => o.disponible !== false && !(n.estado === 'decidido' && n.opcion === o.clave));
      if (!otras.length) return '';
      return '<details class="cmp-con"><summary>Comparar con otra opción</summary><p class="nota">Congela lo de ahora como A y abre B con solo esa diferencia: verás las dos versiones lado a lado.</p><div class="fila" role="group" aria-label="Comparar con otra opción">' +
        otras.map((o) => boton('cmpcon:' + o.clave, 'cmpcon-' + o.clave, 'Comparar con «' + esc(o.nombre) + '»', 'ppp-btn chico')).join('') + '</div></details>';
    }
    function htmlCompararValor(n) {
      if (cmp || n.estado == null || n.raiz || n.unidad.clase === 'texto' || n.unidad.clase === 'si_no' || typeof n.valor_vista !== 'number') return '';
      const k = n.unidad.clase === 'pct' ? 100 : 1;
      return '<details class="cmp-con"><summary>Comparar con otro valor</summary><p class="nota">Congela lo de ahora como A y abre B con el valor que escribas.</p><div class="step"><input id="ppp-cmpv" data-k="cmpv" type="number" inputmode="decimal" step="any" value="' + redondea(n.valor_vista * k, 4) + '" aria-label="Valor para B en ' + esc(n.unidad.etiqueta) + '"><span class="u">' + esc(n.unidad.etiqueta) + '</span>' + boton('cmpval', 'cmpval', 'Comparar', 'ppp-btn') + '</div></details>';
    }

    /* componentes («chips») de un nodo compuesto */
    function baseM2(n) {
      const c = n.componentes.find((x) => x.activo && x.pct > 0 && x.m2 > 0); if (c) return c.m2 / c.pct;
      const p = n.de ? porId(n.de) : null; return p && typeof p.valor_vista === 'number' ? p.valor_vista : null;
    }
    /* la unidad en que el catálogo mide el área (el motor da el mínimo, el máximo y el paso en esa unidad): del propio componente, de la tabla de la definición o, si no hay, se infiere del rango */
    function unidadCat(n, c) {
      if (c.unidad_catalogo) return c.unidad_catalogo;
      if (c.propia) return c.unidad_base || 'm2';
      const tb = tablasAct && tablasAct.ARBOL_COMPONENTES;
      if (tb && tb[0]) { const h = tb[0], iN = h.indexOf('nodo'), iC = h.indexOf('clave'), iU = h.indexOf('unidad_base'), f = tb.slice(1).find((r) => r[iN] === n.id && r[iC] === c.clave); if (f && f[iU]) return f[iU]; }
      return typeof c.max === 'number' && c.max <= 1 ? 'pct' : 'm2';
    }
    function infoComp(n, c) {
      const base = baseM2(n), cat = unidadCat(n, c), uni = compUni[c.clave] || (cat === 'pct' && base ? 'pct' : 'm2');
      const f = (x) => cat === 'pct' ? (uni === 'pct' ? x * 100 : x * base) : (uni === 'm2' ? x : base ? x / base * 100 : x);
      const cruz = (cat === 'pct') !== (uni === 'pct');
      return { base, cat, uni, lo: f(c.min), hi: f(c.max), paso: cruz ? (uni === 'pct' ? 0.1 : 5) : (uni === 'pct' ? c.paso * 100 : c.paso), val: uni === 'pct' ? (c.pct || 0) * 100 : (c.m2 || 0) };
    }
    /* áreas del edificio (decisión D): cada una es un chip con su estado; se cambia el tamaño en m² o en %, se renombra, se quita y se agregan áreas propias */
    const EST_AREA = { referencia: 'Referencia · por confirmar', decidido: 'Decidido', confirmado: 'Confirmado con fuente' };
    const GLIFO_AREA = { referencia: '○', decidido: '●', confirmado: '✓' };
    const estadoArea = (c) => c.estado_plan || (c.estado === 'confirmado' ? 'confirmado' : c.estado === 'editado' ? 'decidido' : 'referencia');
    function htmlAreaNueva(n) {
      const A = n.areas || {}, lleno = A.max_propias != null && (A.propias || 0) >= A.max_propias, f = areaForm, errs = ultimosErrores.filter((e) => e.id === n.id);
      return '<details class="area-nueva" data-af-d' + (f.abierto ? ' open' : '') + '><summary data-k="af-sum">+ Agregar área propia</summary><div class="af-cuerpo">' +
        '<p class="nota">Pon el nombre que quieras (bodega, local, cuarto de bicicletas…) y su tamaño. Si se vende, se cobra al precio por m² de la vivienda; si no, resta de lo vendible.</p>' +
        '<div class="rg-c"><label for="ppp-af-nombre">Nombre del área<input id="ppp-af-nombre" type="text" data-k="af-nombre" data-af="nombre" maxlength="' + (A.nombre_max || 30) + '" autocomplete="off" value="' + esc(f.nombre) + '" placeholder="Ej. Bodega de bicicletas"></label></div>' +
        '<div class="uni" role="group" aria-label="¿Se vende?"><span class="af-l">¿Se vende?</span>' + boton('afvende:no', 'af-vende-no', 'No se vende', 'ppp-btn chico' + (f.vende === 'no' ? ' on' : ''), ' aria-pressed="' + (f.vende === 'no') + '"') + boton('afvende:si', 'af-vende-si', 'Se vende', 'ppp-btn chico' + (f.vende === 'si' ? ' on' : ''), ' aria-pressed="' + (f.vende === 'si') + '"') + '</div>' +
        '<div class="uni" role="group" aria-label="Medir en"><span class="af-l">Tamaño en</span>' + boton('afuni:m2', 'af-uni-m2', 'm²', 'ppp-btn chico' + (f.unidad === 'm2' ? ' on' : ''), ' aria-pressed="' + (f.unidad === 'm2') + '"') + boton('afuni:pct', 'af-uni-pct', '% de la construcción', 'ppp-btn chico' + (f.unidad === 'pct' ? ' on' : ''), ' aria-pressed="' + (f.unidad === 'pct') + '"') + '</div>' +
        '<div class="step"><input type="number" inputmode="decimal" min="0" step="any" data-k="af-valor" data-af="valor" value="' + esc(f.valor) + '" aria-label="Tamaño del área en ' + (f.unidad === 'pct' ? '% de la construcción' : 'm²') + '"><span class="u">' + (f.unidad === 'pct' ? '% de la construcción' : 'm²') + '</span></div>' +
        (errs.length ? errs.map((e) => '<p class="aviso rg-err" role="alert">' + esc(sinIds(e.mensaje)) + '</p>').join('') : '') +
        '<div class="fila">' + (lleno ? '<span class="nota">Ya hay ' + A.max_propias + ' áreas propias: quita una para agregar otra.</span>' : boton('afagrega', 'af-agrega', 'Agregar área', 'ppp-btn')) + '</div>' +
        '<p class="nota">Hasta ' + (A.max_propias || 8) + ' áreas propias · nombre de ' + (A.nombre_min || 2) + ' a ' + (A.nombre_max || 30) + ' caracteres · cada una, hasta ' + nf(A.m2_max || 2000) + ' m² o ' + nf((A.pct_max || 0.3) * 100) + '% de la construcción.</p></div></details>';
    }
    function htmlComponentes(n) {
      const comps = n.componentes, activos = comps.filter((c) => c.activo), apagados = comps.filter((c) => !c.activo);
      const pers = n.opcion === 'personalizado', baseOp = pers ? ((plan.valores[n.id] || {}).base_opcion || (n.referencia && n.referencia.opcion)) : null, baseNom = baseOp && (n.opciones.find((o) => o.clave === baseOp) || {}).nombre;
      let h = '<div class="comps"><h3>Áreas del edificio <small>' + (pers ? 'personalizado · basado en «' + esc(baseNom || baseOp) + '»' : 'toca una para editarla') + '</small></h3><div class="chips" role="group" aria-label="Áreas activas">' +
        activos.map((c) => { const e = estadoArea(c); return boton('comp:' + c.clave, 'comp-' + c.clave, '<b>' + esc(c.nombre) + '</b><i>' + esc(nf(c.m2)) + ' m²</i><em class="ee ee-' + e + '" aria-hidden="true">' + GLIFO_AREA[e] + '</em>', 'chipc' + (compSel === c.clave ? ' on' : '') + (e !== 'referencia' ? ' editado' : '') + (c.propia ? ' propia' : ''), ' aria-pressed="' + (compSel === c.clave) + '" aria-label="' + esc(c.nombre + ', ' + nf(c.m2) + ' metros cuadrados' + (c.pct != null ? ', ' + nf(c.pct * 100, 1) + ' por ciento de la construcción' : '') + ', ' + EST_AREA[e].toLowerCase() + (c.propia ? ', área propia' + (c.vende ? ' que se vende' : '') : '') + '. Toca para editar.') + '"'); }).join('') +
        (activos.length ? '' : '<span class="nota">Ninguna: todo es vendible.</span>') + '</div>' +
        '<p class="nota ee-leyenda"><span aria-hidden="true">○</span> referencia · <span aria-hidden="true">●</span> decidido · <span aria-hidden="true">✓</span> confirmado con fuente</p>';
      const c = comps.find((x) => x.clave === compSel);
      if (c && c.activo) {
        const I = infoComp(n, c), puedeQuitar = !(typeof c.min === 'number' && c.min > 0), u = I.uni === 'pct' ? '% de la construcción' : 'm²', e = estadoArea(c), conf = e === 'confirmado';
        const hiS = c.propia ? Math.min(I.hi, Math.max(I.uni === 'pct' ? 5 : 100, Math.ceil(I.val * 2 / 10) * 10)) : I.hi;      // en un área propia la regla va de cero a algo cercano a su tamaño; con el campo se escribe cualquier número hasta el tope
        h += '<div class="edcomp" data-comp="' + esc(c.clave) + '"><p class="ed-t"><strong>' + esc(c.nombre) + '</strong> · ' + esc(nf(c.m2)) + ' m² · ' + esc(nf((c.pct || 0) * 100, 1)) + '% de la construcción' + (c.propia ? ' <em>propia</em>' : '') + ' <em class="est est-' + e + '">' + esc(EST_AREA[e]) + '</em></p>' +
          (c.fuente && (conf || !c.propia) ? '<p class="nota">' + (conf ? 'Fuente: ' : 'De dónde sale: ') + esc(corto(sinIds(c.fuente), 140)) + '</p>' : '') +
          '<div class="rg-c"><label for="ppp-cnombre">Nombre del área<input id="ppp-cnombre" type="text" data-k="cnombre" data-ar="nombre" maxlength="' + ((n.areas || {}).nombre_max || 30) + '" autocomplete="off" value="' + esc(c.nombre) + '"></label>' + (c.renombrada ? '<span class="nota">Se llama «' + esc(c.nombre_catalogo) + '» en el catálogo; si lo dejas vacío vuelve ese nombre.</span>' : '') + '</div>' +
          (I.base ? '<div class="uni" role="group" aria-label="Medir en"><span class="af-l">Medir en</span>' + boton('uni:m2', 'uni-m2', 'm²', 'ppp-btn chico' + (I.uni === 'm2' ? ' on' : ''), ' aria-pressed="' + (I.uni === 'm2') + '"') + boton('uni:pct', 'uni-pct', '% de la construcción', 'ppp-btn chico' + (I.uni === 'pct' ? ' on' : ''), ' aria-pressed="' + (I.uni === 'pct') + '"') + '</div>' : '') +
          '<div class="step">' + boton('cstep:-1', 'menos', '−', 'sb', ' aria-label="Bajar un paso"') + '<input id="ppp-comp" data-k="campo" type="number" inputmode="decimal" min="' + redondea(I.lo, 3) + '" max="' + redondea(I.hi, 3) + '" step="any" value="' + redondea(I.val, 3) + '" aria-label="' + esc(c.nombre) + ' en ' + esc(u) + '">' + boton('cstep:1', 'mas', '+', 'sb', ' aria-label="Subir un paso"') + '<span class="u">' + esc(u) + '</span></div>' +
          '<input type="range" data-k="rango" min="' + redondea(I.lo, 3) + '" max="' + redondea(hiS, 3) + '" step="' + redondea(I.paso, 4) + '" value="' + redondea(clamp(I.val, I.lo, hiS), 3) + '" aria-label="Rango de ' + esc(c.nombre) + '"><p class="nota rango"><span>' + esc(nf(I.lo, I.uni === 'pct' ? 1 : 0)) + '</span><span>' + (c.propia ? 'Para más, escribe el número' : 'Rango razonable') + '</span><span>' + esc(nf(hiS, I.uni === 'pct' ? 1 : 0)) + '</span></p>' +
          '<div class="uni" role="group" aria-label="Estado del tamaño"><span class="af-l">Estado</span>' + ['referencia', 'decidido', 'confirmado'].map((x) => boton('cestado:' + x, 'cest-' + x, x === 'confirmado' ? 'Confirmado con fuente' : x === 'decidido' ? 'Decidido' : 'Referencia', 'ppp-btn chico' + (e === x ? ' on' : ''), ' aria-pressed="' + (e === x) + '"')).join('') + '</div>' +
          (confArea && !conf ? '<div class="fila"><input type="text" data-k="cfuente" aria-label="¿En qué fuente lo confirmaste?" placeholder="¿Dónde? (plano, oficio, proveedor)" maxlength="60">' + boton('cconfirma', 'cconfirma', 'Confirmar con esta fuente', 'ppp-btn') + '</div>' : '') +
          (c.propia ? '<div class="uni" role="group" aria-label="¿Se vende?"><span class="af-l">¿Se vende?</span>' + boton('cvende:no', 'cvende-no', 'No se vende', 'ppp-btn chico' + (!c.vende ? ' on' : ''), ' aria-pressed="' + (!c.vende) + '"') + boton('cvende:si', 'cvende-si', 'Se vende', 'ppp-btn chico' + (c.vende ? ' on' : ''), ' aria-pressed="' + (!!c.vende) + '"') + '</div>' : '') +
          '<div class="fila">' + (c.propia ? boton('cquitap:' + c.clave, 'quita', 'Quitar ' + esc(c.nombre), 'ppp-btn') : puedeQuitar ? boton('cquita:' + c.clave, 'quita', 'Quitar ' + esc(c.nombre), 'ppp-btn') : '<span class="nota">No se puede quitar: es parte mínima del edificio. Sí puedes cambiar su tamaño.</span>') + '<span class="nota">Si te equivocas, «Deshacer».</span></div></div>';
      } else if (c) h += '<div class="edcomp"><p class="ed-t"><strong>' + esc(c.nombre) + '</strong> está apagada.</p></div>';
      h += htmlAreaNueva(n);
      if (apagados.length) h += '<h3>Agregar del catálogo</h3><div class="chips" role="group" aria-label="Áreas que se pueden agregar">' + apagados.map((x) => boton('cadd:' + x.clave, 'add-' + x.clave, '+ ' + esc(x.nombre) + ' <i>' + esc(unidadCat(n, x) === 'pct' ? nf((x.cantidad_catalogo != null ? x.cantidad_catalogo : x.cantidad) * 100, 0) + '%' : nf(x.cantidad_catalogo != null ? x.cantidad_catalogo : x.cantidad) + ' m²') + '</i>', 'chipc add')).join('') + '</div>';
      if (pers) h += '<div class="fila">' + boton('preajuste:' + baseOp, 'preajuste', 'Volver al preajuste «' + esc(baseNom || baseOp) + '»', 'ppp-btn nose') + '</div>';
      return h + '</div>';
    }

    function panelNumerico(n) {
      const conf = n.estado === 'confirmado', si = n.unidad.clase === 'si_no';
      const et = n.raiz ? chip('Dato de partida') : conf ? chip('Confirmado') : n.estado === 'decidido' ? chip('Decidido por ti', 'punteado') : n.tipo === 'se_busca' ? chip('Se busca · referencia', 'punteado') : chip('Regla del oficio · por confirmar', 'punteado');
      const lugar = n.confirma_en ? '<strong>Dónde se confirma:</strong> ' + esc(sinIds(n.confirma_en)) + ' ' : '';
      const ori = n.origen && !n.raiz && !(n.fuentes || []).length ? '<strong>De dónde salió la referencia:</strong> ' + esc(sinIds(n.origen)) : '';
      const ubic = n.raiz ? ' · ' + esc((plan.datos && plan.datos['I-08']) || '') : '';
      const sencillo = !n.raiz && (n.id === 'D-01' || String(n.que_es || '').length > 260);      // un dato que cuesta entender lleva su explicación a la vista, en palabras sencillas
      const al = htmlAlertas(n), rojas = alertasDe(n.id).some((x) => x.nivel !== 'info');      // lo que no pasa va primero; los avisos informativos, después de la explicación
      let h = '<h2 tabindex="-1" data-foco>' + esc(n.titulo) + ' ' + et + '</h2>' + (rojas || !sencillo ? al : '') +
        '<div class="grande" data-grande>' + esc(fmt(n.valor_vista, n.unidad)) + ubic + antesTxt(n) + '</div>' + (sencillo ? '<div class="sencillo" data-sencillo><strong>En palabras sencillas</strong><p>' + esc(sinIds(n.que_es)) + '</p></div>' : '') + (!rojas && sencillo ? al : '') + htmlEfecto() +
        htmlFuentes(n) + '<p class="nota">' + (sencillo ? '' : esc(sinIds(n.que_es)) + ' ') + lugar + ori + '</p>';
      if (si) h += '<div class="ops dos" role="group" aria-label="Sí o no">' + ['si', 'no'].map((x) => boton('si:' + x, 'si-' + x, '<b>' + (x === 'si' ? 'Sí' : 'No') + '</b>', 'op' + (n.valor_vista === x ? ' on' : ''), ' aria-pressed="' + (n.valor_vista === x) + '"')).join('') + '</div>';
      else h += htmlEditorNum(n, n.raiz ? 'Cambiar el tamaño' : (n.fuentes || []).length ? 'U otro valor' : n.tipo === 'se_busca' ? 'Ya lo busqué, es' : 'Usar otro valor');
      if (!n.raiz && !si && n.rango) h += '<details class="conf"><summary>Ya lo confirmé en una fuente</summary><div class="fila"><input type="text" data-k="fuente" aria-label="¿En qué fuente lo confirmaste?" placeholder="¿Dónde? (documento, oficio, proveedor)" maxlength="120"><button type="button" class="ppp-btn" data-a="confirmar" data-k="confirmar">Confirmar este valor</button></div></details>';
      if (!n.raiz && n.estado && n.estado !== 'referencia') h += '<div class="fila"><button type="button" class="ppp-btn nose" data-a="ref" data-k="ref">Volver a la referencia</button></div>';
      return h + htmlCompararCon(n) + htmlCompararValor(n);
    }

    function panelCalculado(n) {
      const ent = ((n.de_que_sale && n.de_que_sale.ids) || []).map(porId).filter(Boolean).slice(0, 8);
      const prueba = (res.pruebas.items || []).find((i) => i.id === n.id);
      const pr = prueba ? (prueba.estado === 'ok' ? chip('Pasa') : prueba.estado === 'fuera' ? chip('No pasa', 'rojo') : chip('No aplica', 'punteado')) : '';
      return '<h2 tabindex="-1" data-foco>' + esc(n.titulo) + ' ' + chip('Calculado') + ' ' + chip(n.heredado === 'firme' ? 'Todo firme' : 'Estimado', n.heredado === 'firme' ? '' : 'punteado') + ' ' + pr + '</h2>' + htmlAlertas(n) +
        '<div class="grande" data-grande>' + esc(fmt(n.valor_vista, n.unidad)) + antesTxt(n) + '</div>' + htmlEfecto() +
        '<p class="nota">' + esc(sinIds(n.que_es)) + '</p>' +
        '<p class="nota"><strong>De qué sale:</strong> ' + esc(sinIds((n.de_que_sale && n.de_que_sale.texto) || '')) + '</p>' +
        (ent.length ? '<div class="entradas" role="group" aria-label="Datos de los que sale">' + ent.map((x) => boton('ir:' + x.id, 'ir-' + x.id, esc(x.titulo) + ' · ' + esc(textoValor(x)))).join('') + '</div>' : '') +
        (n.id.indexOf('RV-') === 0 ? '' : '<p class="nota">Nadie lo escribe: cambia solo cuando cambia alguno de esos datos.</p>');
    }

    /* la nota de la estrella en el panel de un dato: en qué lámina va y cómo está */
    function htmlEstrella(n) {
      if (!n || !n.estrella || !(n.presentacion || []).length) return '';
      const vistos = [], donde = [];
      n.presentacion.forEach((p) => { const k = p.lamina + '|' + p.tema; if (vistos.indexOf(k) >= 0) return; vistos.push(k); donde.push((p.lamina != null ? 'lámina ' + p.lamina + ', ' : '') + '«' + p.tema + '»' + (p.papel === 'clave' ? ' (dato clave)' : '')); });
      return '<p class="estr-nota ' + esc(n.estrella) + '" data-estrella="' + esc(n.estrella) + '"><span class="estr-g" aria-hidden="true">' + (n.estrella === 'vacia' ? '☆' : '★') + '</span> <strong>Alimenta la presentación</strong> · ' + esc(ESTRELLA_TXT[n.estrella]) + '. Va en ' + esc(donde.join('; ')) + '.</p>';
    }
    /* vista «Presentación»: las láminas con sus datos y sus estrellas. No calcula: pinta res.presentacion, que arma el motor. */
    function panelPresentacion() {
      const P = res.presentacion; if (!P) return '';
      const fichas = Object.keys(FICHA_TXT), ver = fichas.indexOf(fichaPres) >= 0 ? fichaPres : 'todas';
      const datos = P.datos.filter((d) => ver === 'todas' || d.ficha === ver), comp = datos.filter((d) => d.estado === 'completo').length;
      const E = P.estrellas, glifo = (e) => '<span class="estr-g ' + e + '" aria-hidden="true">' + (e === 'vacia' ? '☆' : '★') + '</span>';
      let h = '<h2 tabindex="-1" data-foco>Presentación ' + chip(comp + ' de ' + datos.length + ' completos', comp === datos.length ? '' : 'alerta') + '</h2>' +
        '<p class="nota">Cada estrella es un dato del árbol que alimenta la presentación. Una lámina está completa cuando todos sus datos clave tienen dato. Toca un dato para verlo en el árbol.</p>' +
        '<p class="pres-ley">' + glifo('llena') + ' ' + E.llenas + (E.llenas === 1 ? ' firme' : ' firmes') + ' · ' + glifo('supuesto') + ' ' + E.supuestos + ' con supuesto por confirmar · ' + glifo('vacia') + ' ' + E.vacias + ' sin dato</p>' +
        '<div class="pres-f" role="group" aria-label="Ficha">' + [['todas', 'Las dos fichas']].concat(fichas.map((f) => [f, FICHA_TXT[f]])).map(([k, t]) => boton('pficha:' + k, 'pf-' + k, esc(t), 'ppp-btn chico' + (ver === k ? ' on' : ''), ' aria-pressed="' + (ver === k) + '"')).join('') + '</div>';
      const sinDato = datos.reduce((l, d) => l.concat(d.nodos.filter((n) => n.papel === 'clave' && n.estrella === 'vacia' && l.indexOf(n.titulo) < 0).map((n) => n.titulo)), []);
      if (sinDato.length) h += '<p class="pres-falta" role="status"><strong>' + (sinDato.length === 1 ? 'Falta 1 dato clave' : 'Faltan ' + sinDato.length + ' datos clave') + ':</strong> ' + esc(sinDato.map((t) => '«' + t + '»').join(', ')) + '. Sin ' + (sinDato.length === 1 ? 'él' : 'ellos') + ' la presentación queda incompleta.</p>';
      const laminas = []; datos.forEach((d) => { let g = laminas.find((x) => x.lamina === d.lamina); if (!g) { g = { lamina: d.lamina, datos: [] }; laminas.push(g); } g.datos.push(d); });
      laminas.sort((a, b) => (a.lamina == null ? 1e9 : a.lamina) - (b.lamina == null ? 1e9 : b.lamina));
      laminas.forEach((L) => {
        const mal = L.datos.filter((d) => d.estado !== 'completo').length;
        h += '<h3 class="lt pres-l' + (mal ? ' falta' : '') + '">' + (L.lamina == null ? 'Sin lámina' : 'Lámina ' + L.lamina) + ' <small>' + (mal ? 'incompleta' : 'completa') + '</small></h3>';
        L.datos.forEach((d) => {
          h += '<h4 class="pres-d">' + esc(d.tema) + ' <small>' + esc(FICHA_TXT[d.ficha] || d.ficha) + (d.estado === 'completo' ? '' : ' · incompleto') + '</small></h4><ul class="lista pres">' + d.nodos.map((x) => {
            const enArbol = !!porId(x.id), valor = x.valor == null ? '—' : fmt(x.valor_vista, x.unidad), est = ESTRELLA_TXT[x.estrella];
            const dentro = '<span class="l-t">' + glifo(x.estrella) + ' ' + esc(x.titulo) + (x.papel === 'clave' ? ' <em class="pres-c">clave</em>' : '') + '</span><span class="l-v">' + esc(valor) + '</span><span class="l-e">' + esc(est + (x.nota ? ' · ' + x.nota : '')) + '</span>';
            const voz2 = ' aria-label="' + esc(x.titulo + ': ' + valor + '. ' + est + (x.papel === 'clave' ? ', dato clave' : '') + '.') + '"';
            return '<li>' + (enArbol ? boton('pir:' + x.id, 'pr-' + d.dato + '-' + x.id, dentro, 'li-b pres-n ' + x.estrella, voz2) : '<div class="li-b pres-n fijo ' + x.estrella + '"' + voz2 + ' role="group">' + dentro + '</div>') + '</li>';
          }).join('') + '</ul>';
        });
      });
      return h;
    }

    function panel(enfoca) {
      const foco = document.activeElement, kFoco = foco && panelEl.contains(foco) ? foco.getAttribute('data-k') : null, enCampo = foco && foco.tagName === 'INPUT' && foco.type === 'text';
      if (vista === 'presentacion' && !res.presentacion) vista = 'nodo';
      if (vista === 'presentacion') panelEl.setAttribute('data-amplio', ''); else panelEl.removeAttribute('data-amplio');   // la lista de láminas es larga: su panel es más alto (pantalla.css)
      const aparte = vista === 'pruebas' || vista === 'reglas' || vista === 'lista' || vista === 'presentacion';
      const n = aparte ? null : (porId(sel) || res.nodos[0]);
      const clave = (aparte ? vista : n && n.id), st = panelEl.scrollTop, mismo = clave === panelClave;
      panelClave = clave;
      if (vista === 'pruebas') { panelEl.style.setProperty('--c', 'var(--riesgo)'); panelEl.innerHTML = panelPruebas() + (toastTxt ? '' : ''); }
      else if (vista === 'reglas') { panelEl.style.setProperty('--c', 'var(--alerta)'); panelEl.innerHTML = panelReglas(); }
      else if (vista === 'lista') { panelEl.style.setProperty('--c', 'var(--confirmar)'); panelEl.innerHTML = panelLista(); }
      else if (vista === 'presentacion') { panelEl.style.setProperty('--c', 'var(--estrella)'); panelEl.innerHTML = panelPresentacion(); }
      else if (!n) { panelEl.innerHTML = ''; return; }
      else {
        panelEl.style.setProperty('--c', colorDe(n));
        const cuerpo = n.tipo === 'se_decide' ? panelDecide(n) : n.tipo === 'calculado' ? panelCalculado(n) : panelNumerico(n), nota = htmlEstrella(n);
        panelEl.innerHTML = (nota ? cuerpo.replace('</h2>', () => '</h2>' + nota) : cuerpo) + (editar ? htmlReglas(n) : '');
      }
      host.querySelector('[data-act="lista"]').setAttribute('aria-pressed', String(vista === 'lista'));
      { const bp = host.querySelector('[data-act="presentacion"]'); if (bp) bp.setAttribute('aria-pressed', String(vista === 'presentacion')); }
      panelEl.scrollTop = mismo && !forzarArriba ? st : 0; forzarArriba = false;
      if (kFoco && !enCampo) { const f = panelEl.querySelector('[data-k="' + kFoco + '"]'); if (f && !f.disabled) { f.focus({ preventScroll: true }); return; } }
      if (enfoca) { const f = panelEl.querySelector('[data-foco]'); if (f) f.focus({ preventScroll: true }); }
    }

    /* ----- acciones ----- */
    function anuncia(t) { voz.textContent = ''; temporizadores.push(setTimeout(() => { voz.textContent = t; }, 30)); }
    function seleccionar(id, enfoca) {
      if (!porId(id)) return;
      vista = 'nodo'; if (sel !== id) { compSel = null; efecto = null; }
      sel = id;
      if (ruta && !ruta.nodos.has(id)) { ruta = null; pintaFranja(); }   // al ir a algo fuera de la ruta, deja de atenuarse todo
      sincroniza(); coloca(); panel(enfoca);
    }
    const aVistaCambio = (q, nodo) => fmt(aVista(nodo, q), nodo.unidad);
    function calculaEfecto(r2, id, titulo) {
      const orden = [id], etiqueta = {};
      ORDEN_TARJETAS.forEach((nm) => { const T = r2.tarjetas[nm]; if (T) T.cifras.forEach((c) => { if (orden.indexOf(c.id) < 0) orden.push(c.id); if (!etiqueta[c.id]) etiqueta[c.id] = c.etiqueta; }); });
      const cambios = {}; (r2.que_cambio || []).forEach((q) => { cambios[q.id] = q; });
      const partes = [];
      orden.forEach((i) => {
        const q = cambios[i], nodo = r2.nodos.find((x) => x.id === i);
        if (!q || !nodo || typeof q.antes !== 'number' || typeof q.despues !== 'number' || partes.length >= 4) return;
        partes.push((i === id ? nodo.titulo : etiqueta[i] || nodo.titulo) + ' ' + aVistaCambio(q.antes, nodo) + ' → ' + aVistaCambio(q.despues, nodo));
      });
      return { titulo, partes };
    }
    /* La persona (o una sugerencia) hizo algo: se le pide el resultado nuevo al motor, que lo compara con el anterior. */
    function decide(id, cambio, o) {
      o = o || {};
      const eraAbierta = res.abiertas.indexOf(id) >= 0; cierre = null;
      const dSel = disp.get(sel), pantallaSel = dSel ? { id: sel, x: dSel.x * cam.k + cam.x, y: dSel.y * cam.k + cam.y } : null;
      const r2 = motor.evalua(DEF, plan, cambio);
      ultimosErrores = r2.errores || [];
      historia.push(plan); if (historia.length > 60) historia.shift();
      plan = r2.plan; guarda();
      const idsAntes = new Set(res.nodos.map((x) => x.id));
      res = r2;
      const nd = porId(id);
      efecto = calculaEfecto(r2, id, o.titulo || (nd ? nd.titulo + ': ' + textoValor(nd) : 'Cambio aplicado'));
      const sig = res.abiertas[0], nuevos = res.nodos.filter((x) => x.marca === 'nuevo');
      vista = o.vista || 'nodo';
      if (eraAbierta && sig) sel = sig; else if (eraAbierta && nuevos.length) sel = nuevos[nuevos.length - 1].id; else if (!porId(sel)) sel = id;
      if (sel !== id && !eraAbierta) { /* una sugerencia puede tocar otro nodo: se queda donde estaba */ }
      // ruta de la causa: sola, si el cambio rompió algo
      const nuevasRotas = alertasRotas().filter((a) => a.nueva), guiado = eraAbierta && res.abiertas.length > 0;   // mientras se arma el plan, la cámara sigue la decisión y la franja avisa; la ruta sola es para cuando se cambia algo ya contestado
      if (nuevasRotas.length && !guiado) ruta = construyeRuta(nuevasRotas.map((a) => a.id));
      else if (nuevasRotas.length) ruta = null;
      else if (ruta && !ruta.ok) { const vivas = ruta.alertas.filter((a) => (res.alertas || []).some((x) => x.id === a)); ruta = vivas.length ? construyeRuta(vivas) : null; }
      else if (ruta && ruta.ok) ruta = null;
      franjaCerrada = false;
      if (modoResumen) autoplegar([id].concat(sel ? [sel] : []));
      if (ruta) desplegarHasta(ruta.nodos);
      pintaTodo(false);
      if (ruta && nuevasRotas.length && !guiado) mostrarRuta();
      else if (nuevos.length || eraAbierta) {
        const clave = [...nuevos.map((x) => x.id)].filter((x) => tgt.has(x)); if (sig && clave.indexOf(sig) < 0) clave.push(sig);
        seguir(clave, sig || (nuevos[0] && nuevos[0].id) || id, id);
      } else {
        const dentro = pantallaSel && pantallaSel.x > 0 && pantallaSel.x < vw && pantallaSel.y > 0 && pantallaSel.y < vh;      // si el dato no estaba a la vista, se le trae (no se deja el lienzo vacío)
        const t0 = pantallaSel && pantallaSel.id === sel && dentro ? tgt.get(sel) : null;     // el nodo que se edita se queda donde estaba en la pantalla aunque el árbol se reacomode
        if (t0) moverCam({ k: cam.k, x: pantallaSel.x - t0.x * cam.k, y: pantallaSel.y - t0.y * cam.k }, 300); else asegurar(sel);
      }
      panel(o.teclado);
      anuncia((nd ? nd.titulo + ': ' + textoValor(nd) + '. ' : '') + (nuevos.length ? nuevos.length + ' datos nuevos en el árbol. ' : '') + (nuevasRotas.length ? nuevasRotas.length + (nuevasRotas.length === 1 ? ' cosa dejó' : ' cosas dejaron') + ' de pasar. ' : '') + (sig ? 'Te toca: ' + (porId(sig) || {}).titulo + '.' : ''));
      if (cmp) actualizaCmp();
      return r2;
    }
    const cambioNodo = (id, c, o) => decide(id, { [id]: c }, o);
    function deshacer() {
      if (cierreVivo()) { reabreCierre(); return; }      // P4: lo último que se hizo fue «Quedarme con…»: se reabre la comparación
      if (!historia.length) return;
      plan = historia.pop(); guarda();
      res = motor.evalua(DEF, plan); ultimosErrores = []; efecto = { titulo: 'Se deshizo el último cambio', partes: [] };
      ruta = null; if (!porId(sel)) sel = res.abiertas[0] || (res.nodos[0] && res.nodos[0].id);
      if (modoResumen) autoplegar([sel]);
      pintaTodo(false); asegurar(sel); panel(); anuncia('Se deshizo el último cambio.');
      if (cmp) actualizaCmp();
    }
    function aplicaSugerencia(alertaId, i) {
      const a = (res.alertas || []).find((x) => x.id === alertaId), s = a && (a.sugerencias || [])[i]; if (!s) return;
      const p = partesSug(s), nodo = porId(s.nodo);
      const antes = new Set(alertasRotas().map((x) => x.id));
      decide(s.nodo, { [s.nodo]: s.cambio }, { titulo: 'Aplicado: ' + p.t });
      const quedan = alertasRotas().map((x) => x.id), resuelta = quedan.indexOf(alertaId) < 0;
      efecto.partes.unshift(resuelta ? 'esa alerta ya no sale' : 'la alerta sigue (' + (alertasRotas().find((x) => x.id === alertaId) || {}).texto + ')');
      const nuevas = quedan.filter((x) => !antes.has(x)).length; if (nuevas) efecto.partes.push(nuevas + (nuevas === 1 ? ' alerta nueva' : ' alertas nuevas'));
      forzarArriba = true; panel();
    }
    function abreAlerta(alertaId) {
      const a = (res.alertas || []).find((x) => x.id === alertaId); if (!a) return;
      const mismos = res.alertas.filter((x) => x.nodo === a.nodo && x.nivel !== 'info').map((x) => x.id);
      vista = 'nodo'; compSel = null; efecto = null;
      const dueno = porId(a.nodo) ? a.nodo : (a.ruta || []).find((x) => porId(x));
      if (dueno) sel = dueno;
      ruta = construyeRuta(mismos.length ? mismos : [alertaId]);
      franjaCerrada = false; desplegarHasta(ruta.nodos); desplegarHasta(new Set([sel]));
      pintaTodo(false); mostrarRuta(); panel(); anuncia('Ruta de la causa marcada: ' + sinIds(a.texto || ''));
    }
    function verPrueba(id) {
      const n = porId(id); if (!n) return;
      const al = alertasRotas().filter((a) => a.nodo === id || (a.sobre || []).indexOf(id) >= 0).map((a) => a.id);
      vista = 'nodo'; compSel = null; efecto = null; sel = id;
      ruta = al.length ? construyeRuta(al) : rutaDeNodo(id);
      desplegarHasta(ruta.nodos); pintaTodo(false); mostrarRuta(); panel(); anuncia(n.titulo + ': ' + textoValor(n) + '.');
    }
    function abrePruebas() { vista = 'pruebas'; panel(true); panelEl.scrollIntoView && panelEl.scrollIntoView({ block: 'nearest' }); }
    function pintaTodo(mueve) {
      disposicion();
      if (!porId(sel) || !visibles.some((n) => n.id === sel)) { const raiz = res.nodos.find((n) => n.raiz) || res.nodos[0]; let up = porId(sel); while (up && !visibles.some((n) => n.id === up.id)) up = porId(up.de); sel = up ? up.id : (raiz && raiz.id); }
      sincroniza(); mueveNodos(); pintaTarjetas(); pintaFranja(); pintaHorizonte(); if (mueve !== false) panel();
      aplicaCam();
      const b = $('[data-act="deshacer"]'); if (b) b.disabled = !historia.length && !cierreVivo();
    }
    function alterna(id) {
      if (!(hijosDe[id] || []).length) return;
      const d0 = disp.get(id), antes = d0 ? { x: d0.x * cam.k + cam.x, y: d0.y * cam.k + cam.y } : null;   // el nodo tocado se queda donde está en la pantalla
      if (plegados.has(id)) plegados.delete(id); else plegados.add(id);
      pintaTodo(false); panel();
      const t0 = tgt.get(id); if (antes && t0) moverCam({ k: cam.k, x: antes.x - t0.x * cam.k, y: antes.y - t0.y * cam.k }, 300);
      anuncia(plegados.has(id) ? 'Rama plegada: ' + ocultosPlie[id] + ' nodos ocultos.' : 'Rama desplegada.');
    }
    function reiniciar() {
      if (cmp) { cmp = null; ppp.removeAttribute('data-vista'); cmpVEl.hidden = true; cmpBarEl.hidden = true; cmpBarEl.innerHTML = ''; host.querySelector('[data-act="comparar"]').setAttribute('aria-pressed', 'false'); }
      cierre = null; plan = planInicial(); res = motor.evalua(DEF, plan); plan = res.plan; guarda(); plegados = new Set(); tarjAntes = {}; ultimosErrores = []; historia = []; ruta = null; efecto = null; compSel = null; vista = 'nodo'; franjaCerrada = false; modoResumen = true;
      host.querySelector('[data-act="resumen"]').setAttribute('aria-pressed', 'true');
      sel = res.abiertas[0] || (res.nodos[0] && res.nodos[0].id);
      autoplegar([sel]);
      elems.forEach((e) => e.g.remove()); elems.clear(); aristas.forEach((a) => a.remove()); aristas.clear(); disp.clear();
      pintaTodo(); tgt.forEach((p, id) => disp.set(id, { x: p.x, y: p.y })); anim.lay = null; coloca(); vistaInicial(); tarjetasSinParpadeo();
      anuncia('Plan nuevo. Te toca: ' + ((porId(sel) || {}).titulo || '') + '.');
    }
    const tarjetasSinParpadeo = () => host.querySelectorAll('.tarj.cambio').forEach((e) => e.classList.remove('cambio'));

    /* ----- el panel: clics y campos (delegación; los controles se vuelven a pintar en cada cambio) ----- */
    const nodoSel = () => porId(sel);
    function valorDeCampo(inp, n) { const v = parseFloat(inp.value); return isFinite(v) ? v : null; }
    function aplicaNumero(n, vDisp, tecl) {
      const k = n.unidad.clase === 'pct' ? 100 : 1, rg = n.rango || {};
      if (vDisp == null) { ultimosErrores = [{ codigo: 'fuera_de_rango', id: n.id, mensaje: 'Escribe un número.' }]; panel(); return; }
      let v = vDisp / k; const crudo = v;
      if (rg.min != null) v = Math.max(rg.min, v); else v = Math.max(0, v);
      if (rg.max != null) v = Math.min(rg.max, v);
      v = redondea(v, 8);
      cambioNodo(n.id, n.raiz ? { valor: v, estado: 'confirmado', fuente: 'dato de muestra' } : { valor: v, estado: 'decidido' }, { teclado: tecl });
      if (Math.abs(crudo - v) > 1e-9) { ultimosErrores = [{ codigo: 'fuera_de_rango', id: n.id, mensaje: 'Ese valor queda fuera del rango razonable; se ajustó al límite más cercano: ' + fmt(v, n.unidad) + '.' }]; panel(); }
    }
    function aplicaComp(n, c, vDisp, tecl) {
      const I = infoComp(n, c); if (vDisp == null) { ultimosErrores = [{ codigo: 'fuera_de_rango', id: n.id, mensaje: 'Escribe un número.' }]; panel(); return; }
      const v = clamp(vDisp, I.lo, I.hi);
      cambioNodo(n.id, { componentes: { [c.clave]: { valor: redondea(I.uni === 'pct' ? v / 100 : v, 8), unidad: I.uni, activo: true } } }, { teclado: tecl, titulo: c.nombre + ' → ' + (I.uni === 'pct' ? nf(v, 1) + '% de la construcción' : nf(v) + ' m²') });
      if (Math.abs(v - vDisp) > 1e-9) {        // tanto si se pasa como si queda por debajo (por ejemplo, un tamaño negativo), se avisa
        ultimosErrores = [{ codigo: 'fuera_de_rango', id: n.id, mensaje: 'Ese valor queda ' + (vDisp < I.lo ? 'por debajo del mínimo' : 'por encima del máximo') + ' de «' + c.nombre + '»; se ajustó a ' + nf(v, I.uni === 'pct' ? 1 : 0) + (I.uni === 'pct' ? ' % de la construcción' : ' m²') + '.' }]; panel();
      }
    }
    function agregaArea(n, tecl) {
      const f = areaForm, v = parseFloat(String(f.valor).replace(',', '.')), clave = (n.areas || {}).clave_nueva, nombre = String(f.nombre || '').trim();
      f.abierto = true;
      if (!clave) { ultimosErrores = [{ codigo: 'area_limite', id: n.id, mensaje: 'Ya no caben más áreas propias en este edificio.' }]; panel(); return; }
      if (!isFinite(v) || v < 0) { ultimosErrores = [{ codigo: 'fuera_de_rango', id: n.id, mensaje: 'Escribe el tamaño del área (un número).' }]; panel(); return; }
      cambioNodo(n.id, { componentes: { [clave]: { propia: true, nombre, rol: f.vende === 'si' ? 'vendible' : 'no_vendible', valor: redondea(f.unidad === 'pct' ? v / 100 : v, 8), unidad: f.unidad, estado: 'decidido' } } }, { teclado: tecl, titulo: 'Agregaste «' + nombre + '» (' + (f.unidad === 'pct' ? nf(v, 1) + '% de la construcción' : nf(v) + ' m²') + (f.vende === 'si' ? ', se vende' : '') + ')' });
      const nn = porId(n.id), agregada = nn && (nn.componentes || []).some((x) => x.clave === clave);
      if (agregada) { areaForm = { abierto: false, nombre: '', vende: 'no', unidad: 'm2', valor: '' }; compSel = clave; panel(); const ed = panelEl.querySelector('.edcomp'); if (ed && ed.scrollIntoView) ed.scrollIntoView({ block: 'nearest' }); }
      else { areaForm.abierto = true; panel(); }
    }
    on(panelEl, 'click', (e) => {
      const b = e.target.closest && e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const [acc, ...rest] = b.getAttribute('data-a').split(':'), arg = rest.join(':'), tecl = e.detail === 0, n = nodoSel();
      /* contra el doble toque: el panel se vuelve a dibujar tras cada acción; un segundo toque rápido en el MISMO lugar caería sobre otro botón. Se ignora. */
      const ahora = performance.now();
      const dedo = e.pointerType === 'touch' || e.pointerType === 'pen' || e.detail >= 2;      // toque con el dedo o doble clic; un clic suelto de ratón no se frena
      if (!tecl && dedo && ultimoToque && ahora - ultimoToque.t < 450 && Math.hypot(e.clientX - ultimoToque.x, e.clientY - ultimoToque.y) < 40 && ultimoToque.a !== b.getAttribute('data-a')) { e.preventDefault(); return; }
      if (!tecl) ultimoToque = { t: ahora, x: e.clientX, y: e.clientY, a: b.getAttribute('data-a') };
      switch (acc) {
        case 'op': cambioNodo(n.id, { opcion: arg, estado: 'decidido' }, { teclado: tecl }); break;
        case 'nose': cambioNodo(n.id, { estado: 'no_se' }, { teclado: tecl }); break;
        case 'ref': cambioNodo(n.id, { estado: 'referencia' }, { teclado: tecl, titulo: n.titulo + ': de vuelta a la referencia' }); break;
        case 'fuente': cambioNodo(n.id, { opcion: arg, estado: 'decidido' }, { teclado: tecl, titulo: n.titulo + ': fuente «' + ((n.fuentes.find((f) => f.clave === arg) || {}).nombre || arg) + '»' }); break;
        case 'si': cambioNodo(n.id, { valor: arg, estado: 'decidido' }, { teclado: tecl }); break;
        case 'step': { const rg = n.rango || { paso: Math.abs(n.valor_vista) >= 1000 ? 10 : Math.abs(n.valor_vista) >= 100 ? 1 : 0.1 }, k = n.unidad.clase === 'pct' ? 100 : 1, inp = panelEl.querySelector('#ppp-otro'), act = inp && isFinite(parseFloat(inp.value)) ? parseFloat(inp.value) : n.valor_vista * k; aplicaNumero(n, redondea(act + (+arg) * (rg.paso || 1) * k, 6), tecl); break; }
        case 'confirmar': { const f = panelEl.querySelector('[data-k="fuente"]'), t = f ? f.value.trim() : ''; if (!t) { ultimosErrores = [{ codigo: 'fuente_no_disponible', id: n.id, mensaje: 'Para confirmar hay que decir de dónde sale el dato. Escribe la fuente.' }]; panel(); const g = panelEl.querySelector('details.conf'); if (g) g.open = true; break; } cambioNodo(n.id, { valor: n.valor_vista, estado: 'confirmado', fuente: t }, { teclado: tecl, titulo: n.titulo + ': confirmado' }); break; }
        case 'comp': compSel = compSel === arg ? null : arg; confArea = false; panel(); { const ed = panelEl.querySelector('.edcomp'); if (ed && ed.scrollIntoView) ed.scrollIntoView({ block: 'nearest' }); } break;
        case 'uni': compUni[compSel] = arg; panel(); break;
        case 'cstep': { const c = n.componentes.find((x) => x.clave === compSel); if (!c) break; const I = infoComp(n, c), inp = panelEl.querySelector('#ppp-comp'), act = inp && isFinite(parseFloat(inp.value)) ? parseFloat(inp.value) : I.val; aplicaComp(n, c, redondea(act + (+arg) * I.paso, 4), tecl); break; }
        case 'cquita': { const c = n.componentes.find((x) => x.clave === arg); cambioNodo(n.id, { componentes: { [arg]: { activo: false } } }, { teclado: tecl, titulo: 'Quitaste ' + (c ? c.nombre : arg) }); compSel = null; panel(); break; }
        case 'cadd': { const c = n.componentes.find((x) => x.clave === arg); compSel = arg; cambioNodo(n.id, { componentes: { [arg]: { activo: true } } }, { teclado: tecl, titulo: 'Agregaste ' + (c ? c.nombre : arg) }); break; }
        case 'preajuste': compSel = null; cambioNodo(n.id, { opcion: arg, estado: 'decidido' }, { teclado: tecl, titulo: 'Volviste al preajuste' }); break;
        case 'sug': { const [aid, i] = [arg.slice(0, arg.lastIndexOf(':')), +arg.slice(arg.lastIndexOf(':') + 1)]; aplicaSugerencia(aid, i); break; }
        case 'ruta': abreAlerta(arg); break;
        case 'alerta': abreAlerta(arg); break;
        case 'prueba': verPrueba(arg); centrar(arg); break;
        case 'ir': seleccionar(arg); centrar(arg); break;
        case 'pficha': fichaPres = arg; panel(); break;
        case 'pir': if (porId(arg)) { desplegarHasta(new Set([arg])); pintaTodo(false); seleccionar(arg); centrar(arg); } break;
        case 'deshacer': deshacer(); break;
        case 'cmpcon': { const o = n.opciones.find((x) => x.clave === arg) || (n.fuentes || []).find((x) => x.clave === arg), nom = o ? (n.opciones.length ? o.nombre : o.nombre + ' (' + fmt(aVista(n, o.valor), n.unidad) + ')') : arg; abreCmp({ nodo: n.id, cambio: { opcion: arg, estado: 'decidido' }, rotA: corto(etiquetaActual(n), 28), rotB: corto(nom, 28) }); break; }
        case 'cmpval': { const inp = panelEl.querySelector('#ppp-cmpv'), v = inp ? parseFloat(inp.value) : NaN, k = n.unidad.clase === 'pct' ? 100 : 1, rg = n.rango || {}; if (!isFinite(v)) { ultimosErrores = [{ codigo: 'fuera_de_rango', id: n.id, mensaje: 'Escribe un número para B.' }]; panel(); break; } let x = v / k; if (rg.min != null) x = Math.max(rg.min, x); if (rg.max != null) x = Math.min(rg.max, x); abreCmp({ nodo: n.id, cambio: { valor: redondea(x, 8), estado: 'decidido' }, rotA: corto(fmt(n.valor_vista, n.unidad), 28), rotB: corto(fmt(x, n.unidad), 28) }); break; }
        case 'umstep': { const i2 = arg.lastIndexOf(':'), rid = arg.slice(0, i2), d = +arg.slice(i2 + 1), nu = porId(rid); if (!nu) break; const k = nu.unidad.clase === 'pct' ? 100 : 1, inp = panelEl.querySelector('#ppp-um-' + rid), act = inp && isFinite(parseFloat(inp.value)) ? parseFloat(inp.value) : nu.valor_vista * k; aplicaUmbral(rid, redondea(act + d * ((nu.rango || {}).paso || 1) * k, 6), tecl); break; }
        case 'umlibro': { const nu = porId(arg); if (!nu) break; decide(arg, { [arg]: { estado: 'referencia' } }, { teclado: tecl, vista: 'pruebas', titulo: 'Umbral de vuelta al del libro: ' + fmt(aVista(nu, nu.referencia && nu.referencia.valor != null ? nu.referencia.valor : nu.valor), nu.unidad) }); break; }
        case 'cestado': { const c = n.componentes.find((x) => x.clave === compSel); if (!c) break; if (arg === 'confirmado') { confArea = true; panel(); const f = panelEl.querySelector('[data-k="cfuente"]'); if (f) f.focus(); break; } confArea = false; cambioNodo(n.id, { componentes: { [c.clave]: { estado: arg } } }, { teclado: tecl, titulo: c.nombre + ': ' + EST_AREA[arg].toLowerCase() }); break; }
        case 'cconfirma': { const c = n.componentes.find((x) => x.clave === compSel), f = panelEl.querySelector('[data-k="cfuente"]'), t = f ? f.value.trim() : ''; if (!c) break; if (!t) { ultimosErrores = [{ codigo: 'fuente_no_disponible', id: n.id, mensaje: 'Para confirmar el tamaño hay que decir de dónde sale. Escribe la fuente.' }]; panel(); break; } confArea = false; cambioNodo(n.id, { componentes: { [c.clave]: { estado: 'confirmado', fuente: t } } }, { teclado: tecl, titulo: c.nombre + ': confirmado con fuente' }); break; }
        case 'cvende': { const c = n.componentes.find((x) => x.clave === compSel); if (!c) break; cambioNodo(n.id, { componentes: { [c.clave]: { rol: arg === 'si' ? 'vendible' : 'no_vendible' } } }, { teclado: tecl, titulo: c.nombre + (arg === 'si' ? ': se vende' : ': no se vende') }); break; }
        case 'cquitap': { const c = n.componentes.find((x) => x.clave === arg); cambioNodo(n.id, { componentes: { [arg]: { quitar: true } } }, { teclado: tecl, titulo: 'Quitaste ' + (c ? c.nombre : 'el área') }); compSel = null; confArea = false; panel(); break; }
        case 'afvende': areaForm.vende = arg; areaForm.abierto = true; panel(); break;
        case 'afuni': areaForm.unidad = arg; areaForm.abierto = true; panel(); break;
        case 'afagrega': agregaArea(n, tecl); break;
        case 'rgquita': quitaOpcion(n, arg); break;
        case 'rgalta': altaOpcion(n); break;
        case 'rgcquita': quitaComponente(n, arg); break;
        case 'rgcalta': altaComponente(n); break;
        case 'rgundo': deshacerCambioRegla(+arg); break;
        case 'rgtodo': volverOriginal(); break;
        case 'rgexporta': verExport = !verExport; panel(); break;
        case 'copia': copiar(arg); break;
        default: break;
      }
    });
    on(panelEl, 'change', (e) => {
      const t = e.target, n = nodoSel(); if (!t.getAttribute) return;
      const rg = t.getAttribute('data-rg'); if (rg) { editaCampo(t, rg); return; }
      const ru = t.getAttribute('data-ru'); if (ru) { aplicaUmbral(ru, valorDeCampo(t), true); return; }
      if (t.getAttribute('data-af')) { areaForm[t.getAttribute('data-af')] = t.value; return; }
      if (!n) return;
      if (t.getAttribute('data-ar') === 'nombre') {
        const c = n.componentes.find((x) => x.clave === compSel); if (!c) return;
        const v = String(t.value || '').trim(); if (v === c.nombre) return;
        cambioNodo(n.id, { componentes: { [c.clave]: { nombre: v === '' && !c.propia ? null : v } } }, { teclado: true, titulo: (c.propia || v ? 'Renombraste «' + c.nombre + '» a «' + v + '»' : '«' + c.nombre + '» vuelve a su nombre del catálogo') });
        return;
      }
      const k = t.getAttribute('data-k');
      if (k !== 'campo' && k !== 'rango') return;
      const v = valorDeCampo(t, n);
      if (panelEl.querySelector('.edcomp[data-comp]') && t.closest('.edcomp')) { const c = n.componentes.find((x) => x.clave === compSel); if (c) aplicaComp(n, c, v, true); }
      else aplicaNumero(n, v, true);
    });
    on(panelEl, 'toggle', (e) => {      // los plegables que la persona abre se quedan abiertos al volver a pintar el panel
      const d = e.target; if (!d || !d.matches) return;
      if (d.matches('details.umbral')) { const id = d.getAttribute('data-u'); if (d.open) umbralAbierto.add(id); else umbralAbierto.delete(id); }
      else if (d.matches('details.area-nueva')) areaForm.abierto = d.open;
    }, true);
    on(panelEl, 'input', (e) => {      // el rango y el campo se ven de acuerdo sin recalcular; se aplica al soltar
      const t = e.target; if (t.getAttribute && t.getAttribute('data-af')) { areaForm[t.getAttribute('data-af')] = t.value; return; }
      if (!t.getAttribute || t.getAttribute('data-k') !== 'rango') return;
      const campo = t.closest('.edit, .edcomp') && t.closest('.edit, .edcomp').querySelector('[data-k="campo"]'); if (campo) campo.value = t.value;
    });
    on(panelEl, 'keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches) return;
      if (e.target.matches('input[data-af]')) { e.preventDefault(); areaForm[e.target.getAttribute('data-af')] = e.target.value; const n = nodoSel(); if (n) agregaArea(n, true); return; }
      if (!e.target.matches('input[data-k="campo"], input[data-ru], input[data-ar]')) return;
      e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true }));
    });
    on($('[data-cards]'), 'click', (e) => { const t = e.target.closest && e.target.closest('[data-abre]'); if (t) abrePruebas(); });
    on($('[data-cards]'), 'keydown', (e) => { const t = e.target.closest && e.target.closest('[data-abre]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrePruebas(); } });
    on(franjaEl, 'click', (e) => { const b = e.target.closest && e.target.closest('[data-alerta]'); if (b) abreAlerta(b.getAttribute('data-alerta')); });

    /* ----- gestos: Pointer Events ----- */
    const pts = new Map(); let gesto = null, tapPrev = null;
    const rel = (e) => { const r = lienzo.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function iniciaPinch() {
      const [a, b] = [...pts.values()]; const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesto = { tipo: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, cam0: { x: cam.x, y: cam.y, k: cam.k }, w: { x: (m.x - cam.x) / cam.k, y: (m.y - cam.y) / cam.k }, activo: true };
      lienzo.classList.add('arrastrando'); anim.cam = null;       // un dedo que arrastra o pellizca manda sobre cualquier animación de cámara (por ejemplo la de «llevar a la vista» al enfocar un dato)
    }
    on(lienzo, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest && e.target.closest('.ppp-ctrl')) return;
      anim.cam = null;
      const p = rel(e); pts.set(e.pointerId, { x: p.x, y: p.y, x0: p.x, y0: p.y, t0: performance.now(), target: e.target, id: e.pointerId });
      if (pts.size === 1) gesto = { tipo: 'pan', cam0: { x: cam.x, y: cam.y, k: cam.k }, ox: p.x, oy: p.y, activo: false };
      else if (pts.size === 2) iniciaPinch();
      if (pts.size >= 2) { try { lienzo.setPointerCapture(e.pointerId); } catch (x) { /* sin captura */ } }
    });
    on(lienzo, 'pointermove', (e) => {
      const q = pts.get(e.pointerId); if (!q) return;
      const p = rel(e); q.x = p.x; q.y = p.y;
      if (!gesto) return;
      if (gesto.tipo === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const k = clamp(gesto.cam0.k * d / gesto.d0, KMIN, KMAX);
        pon({ k, x: m.x - gesto.w.x * k, y: m.y - gesto.w.y * k });
      } else if (gesto.tipo === 'pan' && pts.size === 1) {
        const dx = p.x - gesto.ox, dy = p.y - gesto.oy;
        if (!gesto.activo && Math.hypot(dx, dy) > 6) { gesto.activo = true; q.mov = true; anim.cam = null; lienzo.classList.add('arrastrando'); try { lienzo.setPointerCapture(e.pointerId); } catch (x) { /* sin captura */ } }
        if (gesto.activo) pon({ k: gesto.cam0.k, x: gesto.cam0.x + dx, y: gesto.cam0.y + dy });
      }
    });
    function suelta(e) {
      const q = pts.get(e.pointerId); if (!q) return;
      pts.delete(e.pointerId);
      const era = gesto;
      if (pts.size === 0) {
        lienzo.classList.remove('arrastrando');
        if (e.type === 'pointerup' && era && era.tipo === 'pan' && !era.activo && performance.now() - q.t0 < 600) toque(q, e);
        gesto = null;
      } else if (pts.size === 1) {
        const r = [...pts.values()][0]; gesto = { tipo: 'pan', cam0: { x: cam.x, y: cam.y, k: cam.k }, ox: r.x, oy: r.y, activo: true }; r.mov = true;
      }
    }
    on(lienzo, 'pointerup', suelta); on(lienzo, 'pointercancel', suelta);
    function toque(q, e) {
      const t = q.target, plie = t.closest && t.closest('[data-fold]'), nodo = t.closest && t.closest('[data-id]'), ahora = performance.now();
      const doble = tapPrev && ahora - tapPrev.t < 360 && Math.hypot(q.x - tapPrev.x, q.y - tapPrev.y) < 36;
      if (plie) { tapPrev = null; alterna(plie.getAttribute('data-fold')); return; }
      if (doble) {
        tapPrev = null;
        if (nodo) { seleccionar(nodo.getAttribute('data-id')); centrar(nodo.getAttribute('data-id')); }
        else moverCam(zoomEn(q.x, q.y, 1.8), 260);
        return;
      }
      tapPrev = { t: ahora, x: q.x, y: q.y };
      if (nodo) seleccionar(nodo.getAttribute('data-id'));
      else if (ruta) limpiarRuta();
    }
    on(lienzo, 'wheel', (e) => {
      e.preventDefault(); anim.cam = null;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const p = rel(e); pon(zoomEn(p.x, p.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016))));
    }, { passive: false });
    ['gesturestart', 'gesturechange'].forEach((n) => on(lienzo, n, (e) => e.preventDefault()));
    on(lienzo, 'dblclick', (e) => e.preventDefault());

    /* ----- botones ----- */
    function conPlegado() { if (modoResumen) { autoplegar([sel], true); if (ruta) desplegarHasta(ruta.nodos); pintaTodo(false); } }
    on(host, 'click', (e) => {
      const b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
      const a = b.getAttribute('data-act'), base = anim.cam ? anim.cam.a : cam, c = { x: vw / 2, y: vh / 2 };
      if (a === 'mas') moverCam(zoomEn(c.x, c.y, 1.4, base), 220);
      else if (a === 'menos') moverCam(zoomEn(c.x, c.y, 1 / 1.4, base), 220);
      else if (a === 'todo') { conPlegado(); verTodo(); }
      else if (a === 'abierto') { const id = res.abiertas[0]; if (id) { seleccionar(id); centrar(id); } else anuncia('No hay decisiones abiertas.'); }
      else if (a === 'resumen') {
        modoResumen = !modoResumen; b.setAttribute('aria-pressed', String(modoResumen));
        b.setAttribute('aria-label', modoResumen ? 'Plegar lo ya resuelto (activado)' : 'Plegar lo ya resuelto (desactivado: todo abierto)');
        if (modoResumen) autoplegar([sel], true); else plegados = new Set();
        if (ruta) desplegarHasta(ruta.nodos);
        pintaTodo(false); verTodo(); anuncia(modoResumen ? 'Lo ya resuelto se pliega.' : 'Todo el árbol abierto.');
      }
      else if (a === 'ley') { const abre = leyEl.hidden; leyEl.hidden = !abre; b.setAttribute('aria-expanded', String(abre)); }
      else if (a === 'comparar') { if (cmp) fijaVista('cmp'); else abreCmp(); }
      else if (a === 'editar') { editar = !editar; errCampo = null; pintaModo(); if (vista === 'reglas' && !editar) vista = 'nodo'; panel(); anuncia(editar ? 'Modo editar reglas encendido: borrador sin publicar.' : 'Modo editar reglas apagado.'); }
      else if (a === 'lista') { vista = vista === 'lista' ? 'nodo' : 'lista'; panel(true); }
      else if (a === 'presentacion') { vista = vista === 'presentacion' ? 'nodo' : 'presentacion'; panel(true); if (vista === 'presentacion') ppp.scrollTop = ppp.scrollHeight; }   // el panel es lo último de la pantalla: se trae a la vista dentro de ella, sin mover la página
      else if (a === 'vercambios') { vista = 'reglas'; panel(true); if (panelEl.scrollIntoView) panelEl.scrollIntoView({ block: 'nearest' }); }
      else if (a.indexOf('esc:') === 0) { cambiaEscenario(a.slice(4)); if (cmp && cmp.ver === 'cmp') { fijaVista('arbol'); } }
      else if (a.indexOf('ver:') === 0) fijaVista(a.slice(4));
      else if (a.indexOf('quedar:') === 0) cierraCmp(a.slice(7));
      else if (a.indexOf('editaen:') === 0) { const [, s2, ...r2] = a.split(':'), id = r2.join(':'); cambiaEscenario(s2, true); fijaVista('arbol'); pintaTodo(false); if (porId(id)) { desplegarHasta(new Set([id])); pintaTodo(false); seleccionar(id); centrar(id); } else { panel(); } pintaCmpBar(); }
      else if (a === 'quitar-ruta') limpiarRuta();
      else if (a === 'deshacer') deshacer();
      else if (a === 'reiniciar') {
        if (!reinicioPend) { b.textContent = '¿Seguro? Toca otra vez'; b.classList.add('alerta'); reinicioPend = setTimeout(() => { reinicioPend = 0; b.textContent = 'Empezar de nuevo'; b.classList.remove('alerta'); }, 3500); }
        else { clearTimeout(reinicioPend); reinicioPend = 0; b.textContent = 'Empezar de nuevo'; b.classList.remove('alerta'); reiniciar(); }
      }
    });

    /* ----- teclado (en el lienzo) ----- */
    on(svg, 'keydown', (e) => {
      const g = e.target.closest && e.target.closest('[data-id]'); const id = g && g.getAttribute('data-id'); if (!id) return;
      const n = porId(id), vis = visibles.map((x) => x.id);
      const mueve = (to) => { if (!to) return; const el = elems.get(to); if (el) { elems.forEach((x, k) => x.g.setAttribute('tabindex', k === to ? '0' : '-1')); el.g.focus(); asegurar(to); } };
      let hecho = true;
      switch (e.key) {
        case 'Enter': case ' ': seleccionar(id, false); anuncia(n.titulo + ': ' + textoValor(n) + '. Detalle abierto abajo.'); break;
        case 'ArrowLeft': mueve(n.de && vis.indexOf(n.de) >= 0 ? n.de : null); break;
        case 'ArrowRight': { const hs = hijosDe[id] || []; if (!hs.length) break; if (plegados.has(id)) alterna(id); mueve(hs[0]); break; }
        case 'ArrowDown': case 'ArrowUp': {
          const mismos = visibles.filter((x) => Math.abs(tgt.get(x.id).x - tgt.get(id).x) < 1).sort((a, b) => tgt.get(a.id).y - tgt.get(b.id).y).map((x) => x.id), i = mismos.indexOf(id), j = mismos[i + (e.key === 'ArrowDown' ? 1 : -1)];
          if (j) mueve(j); break;
        }
        case 'Home': mueve(res.nodos.find((x) => x.raiz).id); break;
        case 'f': case 'F': alterna(id); break;
        case 'Escape': if (ruta) limpiarRuta(); break;
        case '+': case '=': moverCam(zoomEn(vw / 2, vh / 2, 1.3), 200); break;
        case '-': case '_': moverCam(zoomEn(vw / 2, vh / 2, 1 / 1.3), 200); break;
        case '0': conPlegado(); verTodo(); break;
        default: hecho = false;
      }
      if (hecho) e.preventDefault();
    });
    on(document, 'keydown', (e) => { if (e.key === 'Escape' && ruta && !e.defaultPrevented) limpiarRuta(); });     // Escape quita el resaltado desde cualquier foco
    on(svg, 'focusin', (e) => { const g = e.target.closest && e.target.closest('[data-id]'); if (g) asegurar(g.getAttribute('data-id')); });

    /* ═══════════════════════════ COMPARADOR A / B ═══════════════════════════
       «Comparar» congela el plan actual como A; lo que se cambie después va a B. El motor compara el plan A con los cambios que llevan de A a B
       (`diffPlanes`); las cifras de las siete tarjetas salen de evalua() de cada plan, el veredicto y el porqué de compara(). */
    const clonaPlan = (p) => JSON.parse(JSON.stringify(p));
    const SOLO_CIFRAS = { sugerencias: 'no', rutas: 'no' };
    const sigReg = (r) => !r ? 'ø' : JSON.stringify([r.estado === 'no_se' ? 'no_se' : 'v', r.opcion || null, r.valor === undefined ? null : r.valor, r.base_opcion || null]);
    const sigComp = (e) => JSON.stringify([e && e.activo !== undefined ? e.activo : null, e && e.valor !== undefined ? e.valor : null, (e && e.unidad) || null]);
    const pickComp = (e) => { const o = {}; ['activo', 'valor', 'unidad'].forEach((k) => { if (e && e[k] !== undefined) o[k] = e[k]; }); return o; };
    /* los `cambio` que llevan del plan A al plan B (lo que `compara` espera); `omitidas`: datos que A todavía no tenía a la vista */
    function diffPlanes(pa, pb, visA, visB) {
      const cambios = {}, omitidas = [];
      const ids = new Set(Object.keys(pa.valores || {}).concat(Object.keys(pb.valores || {})));
      ids.forEach((id) => {
        const ra = (pa.valores || {})[id], rb = (pb.valores || {})[id], ca = (pa.componentes || {})[id] || {}, cb = (pb.componentes || {})[id] || {};
        const igualC = Object.keys(ca).length === Object.keys(cb).length && Object.keys(cb).every((k) => k in ca && sigComp(ca[k]) === sigComp(cb[k]));
        if (sigReg(ra) === sigReg(rb) && igualC) return;
        if (!visA.has(id) && !(rb && visB.has(id))) return;     // M6: un dato que A todavía no tenía a la vista pero B sí abre ya se compara (el motor lo marca «nuevo en B»)
        if (!rb) { if (visB.has(id)) cambios[id] = { estado: 'referencia' }; return; }
        if (rb.estado === 'no_se') { cambios[id] = { estado: 'no_se' }; return; }
        if (rb.opcion === 'personalizado') {
          const base = rb.base_opcion, mismaBase = ra && ra.opcion === 'personalizado' && ra.base_opcion === base;
          const comp = {}, soloLoNuevo = mismaBase && Object.keys(ca).every((k) => k in cb);
          Object.keys(cb).forEach((k) => { if (!soloLoNuevo || !(k in ca) || sigComp(ca[k]) !== sigComp(cb[k])) comp[k] = pickComp(cb[k]); });
          const c = {}; if (!soloLoNuevo && base) { c.opcion = base; c.estado = 'decidido'; }
          if (Object.keys(comp).length) c.componentes = comp;
          if (Object.keys(c).length) cambios[id] = c;
          return;
        }
        if (rb.opcion) { cambios[id] = { opcion: rb.opcion, estado: 'decidido' }; if (rb.fuente) cambios[id].fuente = rb.fuente; return; }
        if (rb.valor !== undefined) { cambios[id] = { valor: rb.valor, estado: rb.estado || 'decidido' }; if (rb.fuente) cambios[id].fuente = rb.fuente; if (rb.marca) cambios[id].marca = rb.marca; }
      });
      return { cambios, omitidas };
    }
    function calculaCmp() {
      const pa = cmp.A.plan, pb = cmp.B.plan;
      const rA = motor.evalua(DEF, pa, null, SOLO_CIFRAS), rB = motor.evalua(DEF, pb, null, SOLO_CIFRAS);
      const df = diffPlanes(pa, pb, new Set(rA.nodos.map((n) => n.id)), new Set(rB.nodos.map((n) => n.id)));
      const c = motor.compara(DEF, pa, { id: 'B', cambios: df.cambios }, 'ab');
      return { rA, rB, cambios: df.cambios, omitidas: df.omitidas, c, igual: !Object.keys(df.cambios).length && !df.omitidas.length };
    }
    const rotCmp = (s) => cmp ? (s === 'A' ? cmp.rotA : cmp.rotB) : s;
    function cifraDe(r, id) { for (const nm of ORDEN_TARJETAS) { const T = r.tarjetas[nm], c = T && T.cifras.find((x) => x.id === id); if (c) return c; } return null; }
    function palabrasCmp(d) {
      const v = d.c && d.c.veredicto; if (!v) return '';
      if (d.igual) return 'A y B son iguales por ahora: cambia una decisión o un valor y verás aquí por qué es mejor uno que el otro.';
      let t = sinIds(v.palabras || '');
      if (v.gana) return t.replace(/^[AB]\b/, '«' + rotCmp(v.gana) + '»');
      return t.replace(/^A y B\b/, '«' + rotCmp('A') + '» y «' + rotCmp('B') + '»');
    }
    /* P3: «A 7 de 9 · B 7 de 9» (antes «7 / 7», que se leía como «7 de 7») */
    function textoEje(e, cA, cB, d) {
      const v = (c) => c ? fmtCifra(c) : '?';
      if (e.eje === 'pruebas') { const tA = (d.rA.pruebas.items || []).length, tB = (d.rB.pruebas.items || []).length; return 'A ' + v(cA) + ' de ' + tA + ' · B ' + v(cB) + ' de ' + tB; }
      return 'A ' + v(cA) + ' · B ' + v(cB);
    }
    const EJE_TXT = { utilidad: 'Utilidad', pruebas: 'Pruebas que pasan', dinero: 'Dinero necesario', plazo: 'Plazo' };
    const PRIO_CIFRAS = ['R-03', 'RV-10', 'R-11', 'K-12', 'R-05', 'R-09', 'C-17', 'PT-07'];

    function guardaActivo() { if (cmp) { cmp[cmp.activo].plan = plan; cmp[cmp.activo].hist = historia; } }
    /* P5: la comparación (A congelado, B, rótulos, versión activa y vista) se guarda y se recupera al recargar (con try/catch; sin almacenamiento sigue igual) */
    function guardaCmp() {
      if (!cmp) { ls.del(CL.comparacion); return; }
      guardaActivo();
      ls.set(CL.comparacion, JSON.stringify({ v: 1, huella: DEF.huella, activo: cmp.activo, ver: cmp.ver, rotA: cmp.rotA, rotB: cmp.rotB, A: { plan: cmp.A.plan, hist: cmp.A.hist.slice(-20) }, B: { plan: cmp.B.plan, hist: cmp.B.hist.slice(-20) } }));
    }
    function restauraCmp() {
      try {
        const g = JSON.parse(ls.get(CL.comparacion) || 'null');
        if (!g || g.v !== 1 || (g.activo !== 'A' && g.activo !== 'B') || !g.A || !g.B) return false;
        const planOk = (p) => { if (!p || !p.valores || !p.valores['T-01']) return null; const r = motor.evalua(DEF, p, null, SOLO_CIFRAS); return (r.errores || []).length ? null : r.plan; };
        const pA = planOk(g.A.plan), pB = planOk(g.B.plan); if (!pA || !pB) return false;
        const histOk = (h) => (Array.isArray(h) ? h : []).filter((x) => x && x.valores && x.valores['T-01']);
        cmp = { A: { plan: pA, hist: histOk(g.A.hist) }, B: { plan: pB, hist: histOk(g.B.hist) }, activo: g.activo, ver: g.ver === 'cmp' ? 'cmp' : 'arbol', rotA: String(g.rotA || 'Plan actual').slice(0, 28), rotB: String(g.rotB || 'Con cambios').slice(0, 28), datos: null };
        plan = cmp[cmp.activo].plan; historia = cmp[cmp.activo].hist; res = motor.evalua(DEF, plan); plan = res.plan; cmp[cmp.activo].plan = plan;
        return true;
      } catch (e) { cmp = null; return false; }
    }
    /* P4: «Quedarme con A/B» se puede deshacer: Deshacer reabre la comparación tal como estaba (A, B, rótulos, versión y vista) mientras el plan no haya cambiado desde entonces */
    const cierreVivo = () => !!(cierre && !cmp && cierre.firma === JSON.stringify(plan) && cierre.huella === DEF.huella);
    function reabreCierre() {
      const sn = cierre.snap; cierre = null;
      cmp = { A: { plan: sn.A.plan, hist: sn.A.hist }, B: { plan: sn.B.plan, hist: sn.B.hist }, activo: sn.activo, ver: sn.ver, rotA: sn.rotA, rotB: sn.rotB, datos: null };
      plan = cmp[cmp.activo].plan; historia = cmp[cmp.activo].hist;
      res = motor.evalua(DEF, plan); plan = res.plan; cmp[cmp.activo].plan = plan; guarda();
      ultimosErrores = []; efecto = { titulo: 'Se reabrió la comparación', partes: ['A y B quedaron como estaban'] }; ruta = null; compSel = null; vista = 'nodo';
      if (!porId(sel)) sel = res.abiertas[0] || (res.nodos[0] && res.nodos[0].id);
      if (modoResumen) autoplegar([sel]);
      pintaTodo(false); actualizaCmp(); fijaVista(cmp.ver); panel();
      anuncia('Se reabrió la comparación como estaba: ' + cmp.rotA + ' contra ' + cmp.rotB + '.');
    }
    function actualizaCmp() {
      if (!cmp) return;
      guardaActivo(); cmp.datos = calculaCmp(); guardaCmp();
      pintaCmpBar(); if (cmp.ver === 'cmp') pintaCmpV();
    }
    function fijaVista(v) {
      if (!cmp) { ppp.removeAttribute('data-vista'); return; }
      cmp.ver = v; guardaCmp(); ppp.setAttribute('data-vista', v === 'cmp' ? 'cmp' : 'arbol');
      cmpVEl.hidden = v !== 'cmp';
      host.querySelector('[data-act="comparar"]').setAttribute('aria-pressed', 'true');
      if (v === 'cmp') { pintaCmpV(); } else { temporizadores.push(setTimeout(() => { remide(); pon(cam); }, 30)); }
      pintaCmpBar();
    }
    function abreCmp(cfg) {
      if (cmp) { fijaVista('cmp'); return; }
      cfg = cfg || {};
      const pA = clonaPlan(plan), hA = historia.slice();
      cmp = { A: { plan: pA, hist: hA }, B: { plan: clonaPlan(plan), hist: [] }, activo: 'B', ver: 'arbol', rotA: cfg.rotA || 'Plan actual', rotB: cfg.rotB || 'Con cambios', datos: null };
      historia = cmp.B.hist; ruta = null; efecto = null; compSel = null; cierre = null;
      if (cfg.nodo && cfg.cambio) {
        const r2 = motor.evalua(DEF, plan, { [cfg.nodo]: cfg.cambio });
        if ((r2.errores || []).some((e) => e.codigo !== 'fuera_de_rango' && e.codigo !== 'fuente_no_disponible')) { ultimosErrores = r2.errores; cmp = null; historia = hA; panel(); return; }
        historia.push(pA); plan = r2.plan; res = r2; ultimosErrores = r2.errores || [];
        sel = porId(cfg.nodo) ? cfg.nodo : sel;
        if (modoResumen) autoplegar([sel]);
        pintaTodo(false);
      }
      actualizaCmp(); fijaVista(cfg.nodo ? 'cmp' : 'arbol');
      anuncia(cfg.nodo ? 'Comparación abierta: A es el plan de antes y B lleva ese cambio.' : 'El plan actual quedó congelado como A. Lo que cambies ahora va a B.');
    }
    function cambiaEscenario(s, sinPintar) {
      if (!cmp || cmp.activo === s) return;
      guardaActivo(); cmp.activo = s; plan = cmp[s].plan; historia = cmp[s].hist; guarda();
      res = motor.evalua(DEF, plan); ultimosErrores = []; efecto = null; ruta = null; compSel = null; vista = 'nodo';
      if (!porId(sel)) sel = res.abiertas[0] || (res.nodos[0] && res.nodos[0].id);
      if (modoResumen) autoplegar([sel]);
      if (sinPintar) return;
      pintaTodo(false); asegurar(sel); panel(); pintaCmpBar(); anuncia('Ahora ves en el árbol la versión ' + s + ': ' + rotCmp(s) + '.');
    }
    function cierraCmp(s) {
      if (!cmp) return;
      guardaActivo(); const el = cmp[s], clona = (x) => JSON.parse(JSON.stringify(x));
      const sn = { A: { plan: clona(cmp.A.plan), hist: cmp.A.hist.map(clona) }, B: { plan: clona(cmp.B.plan), hist: cmp.B.hist.map(clona) }, activo: cmp.activo, ver: cmp.ver, rotA: cmp.rotA, rotB: cmp.rotB };
      plan = el.plan; historia = el.hist; cmp = null;
      ppp.removeAttribute('data-vista'); cmpVEl.hidden = true; cmpBarEl.hidden = true; cmpBarEl.innerHTML = '';
      host.querySelector('[data-act="comparar"]').setAttribute('aria-pressed', 'false');
      res = motor.evalua(DEF, plan); plan = res.plan; guarda(); ultimosErrores = []; ruta = null; compSel = null; vista = 'nodo';
      cierre = { snap: sn, firma: JSON.stringify(plan), huella: DEF.huella };
      efecto = { titulo: 'Te quedaste con la versión ' + s + ' · «' + sn['rot' + s] + '»', partes: [] };
      if (!porId(sel)) sel = res.abiertas[0] || (res.nodos[0] && res.nodos[0].id);
      if (modoResumen) autoplegar([sel]);
      pintaTodo(false); panel(); temporizadores.push(setTimeout(() => { remide(); pon(cam); asegurar(sel); }, 30));
      anuncia('Comparación cerrada. Te quedaste con la versión ' + s + '.');
    }
    function pintaCmpBar() {
      if (!cmp) { cmpBarEl.hidden = true; cmpBarEl.innerHTML = ''; return; }
      const d = cmp.datos, enCmp = cmp.ver === 'cmp';
      const seg = (s) => '<button type="button" class="seg-b' + (cmp.activo === s ? ' on' : '') + '" data-act="esc:' + s + '" aria-pressed="' + (cmp.activo === s) + '" aria-label="' + (enCmp ? 'Editar' : 'Ver en el árbol') + ' la versión ' + s + ': ' + esc(rotCmp(s)) + '"><b>' + s + '</b><span>' + esc(corto(rotCmp(s), 16)) + '</span></button>';
      cmpBarEl.innerHTML = '<div class="seg" role="group" aria-label="Versión que ves y editas en el árbol">' + seg('A') + seg('B') + '</div>' +
        '<button type="button" class="ppp-btn chico' + (enCmp ? ' on' : '') + '" data-act="ver:' + (enCmp ? 'arbol' : 'cmp') + '">' + (enCmp ? 'Ver el árbol' : 'Ver comparación') + '</button>' +
        (!enCmp && d ? '<p class="cmp-lin" role="status">' + esc(corto(palabrasCmp(d), 120)) + '</p>' : '');
      cmpBarEl.hidden = false;
    }

    function htmlTarjetaCmp(nombre, d) {
      const TA = d.rA.tarjetas[nombre], TB = d.rB.tarjetas[nombre]; if (!TA || !TB) return null;
      const abA = nombre === 'Riesgo y estado' ? true : TA.encendida, abB = nombre === 'Riesgo y estado' ? true : TB.encendida;
      const base = (abA ? TA : TB).cifras.filter((c, i, l) => l.findIndex((x) => x.id === c.id) === i);
      const filas = base.map((cA) => {
        const cB = TB.cifras.find((x) => x.id === cA.id) || { valor: null, unidad: cA.unidad }, cA2 = TA.cifras.find((x) => x.id === cA.id) || cA;
        const m = d.c.medidas.find((x) => x.id === cA.id), ap = d.c.aportes.find((x) => x.id === cA.id);
        const a = abA ? fmtCifra(cA2) : '?', b = abB ? fmtCifra(cB) : '?', num = typeof cA2.valor === 'number' && typeof cB.valor === 'number';
        let delta = '—', gana = 'Sin juicio', cls = 'sj';
        if (a === '?' || b === '?') { delta = '—'; gana = 'Falta un dato'; }
        else if (num) { delta = ap ? (ap.cambia ? ap.delta_texto : 'sin cambio') : (a === b ? 'sin cambio' : 'cambia'); }
        else delta = a === b ? 'sin cambio' : 'cambia';
        if (a !== '?' && b !== '?') {
          if (m && (m.mejor === 'A' || m.mejor === 'B')) { gana = 'Gana ' + m.mejor; cls = m.mejor === 'A' ? 'a' : 'b'; }
          else if (m && m.mejor === 'empate') { gana = 'Igual'; cls = 'ig'; }
          else if (m && m.mejor === 'dato') { gana = 'Dato, sin juicio'; }
          else if (a === b) { gana = 'Igual'; cls = 'ig'; }
          else if (!m || m.mejor === 'na') { gana = 'Cambia: sin juicio'; }
        }
        return { etiqueta: cA.etiqueta, a, b, delta, gana, cls, cambia: a !== b };
      });
      const li = (f) => '<li class="cc-f cc-' + f.cls + '"><span class="cc-e">' + esc(f.etiqueta) + '</span><span class="cc-g">' + esc(f.gana) + '</span><span class="cc-v cc-va"><i>A</i>' + esc(f.a) + '</span><span class="cc-v cc-vb"><i>B</i>' + esc(f.b) + '</span><span class="cc-d"><small>Diferencia</small>' + esc(f.delta) + '</span></li>';
      if (!filas.length) return null;
      const cambiadas = filas.filter((f) => f.cambia), vis = cambiadas.length ? cambiadas : [filas[0]], resto = filas.filter((f) => vis.indexOf(f) < 0);
      return { hay: cambiadas.length > 0, h: '<section class="cc' + (cambiadas.length ? ' hay' : '') + '" style="--c:var(--' + SLUG[nombre] + ')" aria-label="' + esc(nombre) + '"><h3 class="cc-t">' + esc(nombre) + (cambiadas.length ? ' <small>' + cambiadas.length + (cambiadas.length === 1 ? ' cifra cambia' : ' cifras cambian') + '</small>' : ' <small>sin cambios</small>') + '</h3><ul class="cc-l">' + vis.map(li).join('') + '</ul>' +
        (resto.length ? '<details class="cc-m"><summary>' + (cambiadas.length ? 'Ver las ' + resto.length + (resto.length === 1 ? ' cifra' : ' cifras') + ' que no cambian' : 'Ver las otras ' + resto.length + (resto.length === 1 ? ' cifra' : ' cifras') + ' de esta tarjeta') + '</summary><ul class="cc-l">' + resto.map(li).join('') + '</ul></details>' : '') + '</section>' };
    }
    function htmlPorQue(d) {
      const grupos = new Map(), orden = (id) => { const i = PRIO_CIFRAS.indexOf(id); return i < 0 ? 100 + ORDEN_TARJETAS.findIndex((nm) => d.rA.tarjetas[nm] && d.rA.tarjetas[nm].cifras.some((c) => c.id === id)) : i; };
      d.c.aportes.forEach((ap) => {
        if (!ap.cambia) return;
        ap.lista.forEach((l) => {
          if (l.signo === '0') return;
          if (!grupos.has(l.decision)) grupos.set(l.decision, { texto: l.texto, inter: l.es_interaccion, filas: [] });
          grupos.get(l.decision).filas.push({ ap, l });
        });
      });
      let h = '<h3>Por qué</h3>';
      if (!grupos.size) return h + '<p class="nota">' + (d.igual ? 'No hay diferencias todavía.' : 'Hay diferencias, pero ninguna mueve las cifras de las tarjetas.') + '</p>';
      const bloques = [...grupos.values()].sort((x, y) => (x.inter ? 1 : 0) - (y.inter ? 1 : 0));
      h += '<ul class="porque">' + bloques.map((g) => {
        const filas = g.filas.sort((x, y) => orden(x.ap.id) - orden(y.ap.id) || Math.abs(y.l.efecto) - Math.abs(x.l.efecto));
        const fr = (q) => { const cA = cifraDe(d.rA, q.ap.id), cB = cifraDe(d.rB, q.ap.id); return '<li class="pq-f ' + (q.l.signo === '+' ? 'sube' : 'baja') + '"><span class="pq-e">' + esc(q.ap.etiqueta) + '</span><span class="pq-d">' + esc(q.l.efecto_texto) + '</span><span class="pq-a">' + esc(cA ? fmtCifra(cA) : '?') + ' → ' + esc(cB ? fmtCifra(cB) : '?') + '</span></li>'; };
        const top = filas.slice(0, 4), resto = filas.slice(4);
        return '<li class="pq"><p class="pq-t">' + (g.inter ? 'Las decisiones juntas (efecto combinado)' : 'Por <strong>' + esc(g.texto) + '</strong>') + '</p><ul class="pq-l">' + top.map(fr).join('') + '</ul>' +
          (resto.length ? '<details class="pq-m"><summary>y ' + resto.length + (resto.length === 1 ? ' cifra más' : ' cifras más') + '</summary><ul class="pq-l">' + resto.map(fr).join('') + '</ul></details>' : '') + '</li>';
      }).join('') + '</ul>';
      if ((d.c.causas || []).length) h += '<details class="pq-m causas"><summary>Explicado en frases</summary><ul class="pq-fr">' + d.c.causas.map((t) => '<li>' + esc(sinIds(t)) + '</li>').join('') + '</ul></details>';
      if (d.c.aportes.some((a) => a.aproximada)) h += '<p class="nota">Con más de cuatro diferencias el reparto entre ellas es aproximado.</p>';
      return h;
    }
    function htmlDistinto(d) {
      const ids = Object.keys(d.cambios).concat(d.omitidas);
      if (!ids.length) return '<h3>Qué es distinto</h3><p class="nota">Nada todavía. Pasa al árbol (versión B) y cambia una decisión, un valor o un componente.</p>';
      let h = '<h3>Qué es distinto</h3><ul class="dif">';
      ids.forEach((id) => {
        const na = d.rA.nodos.find((n) => n.id === id), nb = d.rB.nodos.find((n) => n.id === id), n = nb || na; if (!n) return;
        const comp = (n.componentes || []).length;
        let lineas = '';
        if (comp && na && nb) {
          nb.componentes.forEach((cb) => { const ca = na.componentes.find((x) => x.clave === cb.clave) || {}; if ((ca.activo !== cb.activo) || Math.abs((ca.m2 || 0) - (cb.m2 || 0)) > 1e-6) lineas += '<li>' + esc(cb.nombre) + ': ' + (ca.activo ? nf(ca.m2) + ' m²' : 'no estaba') + ' → ' + (cb.activo ? nf(cb.m2) + ' m²' : 'quitado') + '</li>'; });
        }
        h += '<li class="df"><p class="df-t"><strong>' + esc(n.titulo) + '</strong></p><p class="df-v"><span><i>A</i> ' + esc(na ? textoValor(na) : 'todavía no estaba a la vista') + '</span><span><i>B</i> ' + esc(nb ? textoValor(nb) : '—') + '</span></p>' + (lineas ? '<ul class="df-c">' + lineas + '</ul>' : '');
        if (d.omitidas.indexOf(id) >= 0) h += '<p class="nota">A todavía no tenía abierto este dato: se ve en B pero no entra en el porqué.</p>';
        else if ((d.c.nuevos_en_b || []).some((x) => x.id === id)) h += '<p class="nota nuevo-b">Nuevo en B: A todavía no tenía a la vista este dato.</p>';
        if (nb && (nb.opciones || []).length && !comp && nb.tipo === 'se_decide') h += '<div class="df-o" role="group" aria-label="Elegir la opción de B para ' + esc(n.titulo) + '"><span>Poner en B:</span>' + nb.opciones.filter((o) => o.disponible !== false).map((o) => boton('cmpop:' + id + ':' + o.clave, 'cmpop-' + id + '-' + o.clave, esc(o.nombre), 'chipc' + (nb.estado === 'decidido' && nb.opcion === o.clave ? ' on' : ''), ' aria-pressed="' + (nb.estado === 'decidido' && nb.opcion === o.clave) + '"')).join('') + '</div>';
        h += '<div class="fila">' + ['A', 'B'].map((s) => '<button type="button" class="ppp-btn chico" data-act="editaen:' + s + ':' + esc(id) + '">Abrir en el árbol · ' + s + '</button>').join('') + '</div></li>';
      });
      return h + '</ul>';
    }
    function pintaCmpV() {
      if (!cmp || !cmp.datos) return;
      const d = cmp.datos, v = d.c.veredicto || {}, foco = document.activeElement, kf = foco && cmpVEl.contains(foco) ? (foco.getAttribute('data-k') || foco.getAttribute('data-cmp')) : null, st = cmpVEl.scrollTop;
      const ejes = (v.ejes || []).map((e) => { const cA = cifraDe(d.rA, e.id), cB = cifraDe(d.rB, e.id); const g = e.mejor === 'A' || e.mejor === 'B' ? 'gana ' + e.mejor : 'igual'; return '<li class="eje ' + (e.mejor === 'A' ? 'a' : e.mejor === 'B' ? 'b' : 'ig') + '"><b>' + esc(EJE_TXT[e.eje] || e.eje) + '</b><span>' + esc(g) + '</span><small>' + esc(textoEje(e, cA, cB, d)) + '</small></li>'; }).join('');
      const me = v.mejor_en || {}, total = (me.A || 0) + (me.B || 0) + (me.empate || 0);
      const top = '<div class="cv-top"><h2 tabindex="-1" data-foco>Comparación</h2><div class="cv-rot"><label><span class="cv-l">A</span><input type="text" data-cmp="rotA" maxlength="28" value="' + esc(cmp.rotA) + '" aria-label="Nombre de la versión A (en palabras)"></label><label><span class="cv-l b">B</span><input type="text" data-cmp="rotB" maxlength="28" value="' + esc(cmp.rotB) + '" aria-label="Nombre de la versión B (en palabras)"></label></div></div>';
      let h = '<div class="cmp-ver" role="status"><p class="ver-p">' + esc(palabrasCmp(d)) + '</p>' + (d.igual ? '' : '<p class="ver-s">Mejor en: A ' + (me.A || 0) + ' · B ' + (me.B || 0) + ' · igual ' + (me.empate || 0) + ' (de ' + total + ' medidas)</p>') + (ejes && !d.igual ? '<ul class="ejes">' + ejes + '</ul>' : '') + '</div>';
      if ((d.c.errores || []).length) h += '<p class="aviso" role="status">Algún cambio de B no se pudo comparar: ' + esc(sinIds(d.c.errores.map((e) => e.mensaje).join(' '))) + '</p>';
      const tj = ORDEN_TARJETAS.map((nm) => htmlTarjetaCmp(nm, d)).filter(Boolean);       // primero las tarjetas que cambian (en el orden de siempre); las demás, abajo
      h += '<div class="cc-tarjetas">' + tj.filter((x) => x.hay).concat(tj.filter((x) => !x.hay)).map((x) => x.h).join('') + '</div>';
      h += htmlPorQue(d) + htmlDistinto(d);
      h += '<div class="cv-fin"><p class="nota">Puedes seguir editando: en «Abrir en el árbol» eliges la versión, haces el cambio y todo se actualiza. «Deshacer» deshace el último cambio de la versión que estás viendo.</p><div class="fila"><button type="button" class="ppp-btn" data-act="quedar:A" data-k="quedarA">Quedarme con A · ' + esc(corto(cmp.rotA, 18)) + '</button><button type="button" class="ppp-btn" data-act="quedar:B" data-k="quedarB">Quedarme con B · ' + esc(corto(cmp.rotB, 18)) + '</button></div></div>';
      if (!cmpVEl.querySelector('.cv-cuerpo')) cmpVEl.innerHTML = top + '<div class="cv-cuerpo"></div>';      // los campos de los nombres no se vuelven a dibujar (no pierden el foco ni lo escrito)
      ['rotA', 'rotB'].forEach((k) => { const i = cmpVEl.querySelector('[data-cmp="' + k + '"]'); if (i && document.activeElement !== i) i.value = cmp[k]; });
      cmpVEl.querySelector('.cv-cuerpo').innerHTML = h; cmpVEl.scrollTop = st;
      if (kf) { const f = cmpVEl.querySelector('[data-k="' + kf + '"]'); if (f && f.tagName !== 'INPUT') f.focus({ preventScroll: true }); }
    }
    on(cmpVEl, 'input', (e) => { const t = e.target, k = t.getAttribute && t.getAttribute('data-cmp'); if (!k) return; cmp[k] = t.value.trim() || (k === 'rotA' ? 'Plan actual' : 'Con cambios'); guardaCmp(); pintaCmpBar(); });
    on(cmpVEl, 'change', (e) => { const t = e.target, k = t.getAttribute && t.getAttribute('data-cmp'); if (!k) return; cmp[k] = t.value.trim() || (k === 'rotA' ? 'Plan actual' : 'Con cambios'); guardaCmp(); pintaCmpBar(); pintaCmpV(); });
    on(cmpVEl, 'click', (e) => {
      const b = e.target.closest && e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const [acc, ...rest] = b.getAttribute('data-a').split(':');
      if (acc === 'cmpop') { const id = rest[0], clave = rest.slice(1).join(':'); cambiaEscenario('B', true); decide(id, { [id]: { opcion: clave, estado: 'decidido' } }, { teclado: e.detail === 0 }); actualizaCmp(); }
    });

    /* ═══════════════════════════ EDITOR DE REGLAS EN EL LUGAR ═══════════════════════════
       Modo apagado al inicio. Cada cambio se manda a motor.editaDefinicion(definición ORIGINAL, lista completa de cambios): si no valida, el error
       sale junto al campo y no se aplica; si valida, el árbol se recalcula con la regla nueva. Los cambios viven en la sesión (y en localStorage).
       La pantalla no escribe en Sheets: «Exportar» arma el texto para pegar en las pestañas ARBOL_*. Lo estructural se ve, no se edita. */
    const COLS_LLAVE = { ARBOL_NODOS: ['id'], ARBOL_REGLAS: ['id'], ARBOL_FACTORES: ['id'], ARBOL_OPCIONES: ['nodo', 'clave'], ARBOL_COMPONENTES: ['nodo', 'clave'] };
    const NOM_COL = { titulo: 'título', pregunta: 'pregunta', que_es: 'texto que explica', etiqueta_resultado: 'rótulo del resultado', confirma_en: 'dónde se confirma', mercado_dato: 'dato de mercado', referencia_valor: 'valor de referencia', referencia_opcion: 'opción de referencia', referencia_origen: 'fuente de la referencia', rango_min: 'mínimo del rango', rango_max: 'máximo del rango', rango_paso: 'paso del rango', nombre: 'nombre', valor: 'valor', implica: 'lo que implica', fuente: 'fuente', cantidad: 'tamaño', min: 'mínimo', max: 'máximo', paso: 'paso', m2_por_unidad: 'm² por unidad', meta: 'umbral', texto: 'texto del aviso' };
    const llaveDe = (t, c) => COLS_LLAVE[t].map((_, j) => (t === 'ARBOL_NODOS' || t === 'ARBOL_REGLAS' || t === 'ARBOL_FACTORES') ? c.id : (j === 0 ? c.nodo : c.clave));
    const iCol = (tb, c) => tb[0].indexOf(c);
    function buscaFila(tb, tabla, clave) {
      const ks = COLS_LLAVE[tabla].map((c) => iCol(tb, c)), vs = llaveDe(tabla, clave);
      for (let i = 1; i < tb.length; i++) if (ks.every((k, j) => tb[i][k] === vs[j])) return tb[i];
      return null;
    }
    function celda(tabla, clave, col, original) {
      const tb = (original ? tablas0 : tablasAct) && (original ? tablas0 : tablasAct)[tabla]; if (!tb) return null;
      const f = buscaFila(tb, tabla, clave), i = iCol(tb, col); return f && i >= 0 ? f[i] : null;
    }
    const filasDe = (tabla, nodo) => { const tb = tablasAct && tablasAct[tabla]; if (!tb) return []; const k = iCol(tb, tabla === 'ARBOL_REGLAS' ? 'nodo' : 'nodo'), io = iCol(tb, 'orden'); return tb.slice(1).filter((f) => f[k] === nodo).sort((a, b) => (Number(a[io]) || 0) - (Number(b[io]) || 0)); };
    function reconstruyeTablas() {
      if (!tablas0) { tablasAct = null; return; }
      tablasAct = {}; Object.keys(tablas0).forEach((t) => { tablasAct[t] = tablas0[t].map((r) => r.slice()); });
      Object.keys(filasRegla || {}).forEach((t) => {
        const tb = tablasAct[t]; if (!tb || !COLS_LLAVE[t]) return;
        filasRegla[t].forEach((f) => {
          if (f.accion === 'cambia') { const row = buscaFila(tb, t, f.clave); if (row) Object.keys(f.columnas).forEach((c) => { const i = iCol(tb, c); if (i >= 0) row[i] = f.columnas[c] == null ? '' : String(f.columnas[c]); }); }
          else if (f.accion === 'alta') tb.push(tb[0].map((c) => (f.columnas[c] == null ? '' : String(f.columnas[c]))));
          else if (f.accion === 'baja') { const row = buscaFila(tb, t, f.clave); if (row) tb.splice(tb.indexOf(row), 1); }
        });
      });
    }
    reconstruyeTablas();
    function unidadTabla(id) {
      const g = (c) => celda('ARBOL_NODOS', { id }, c, true);
      return { clase: g('unidad_clase') || '', etiqueta: g('unidad_etiqueta') || '', escala: g('unidad_escala') ? Number(g('unidad_escala')) : undefined };
    }
    const convU = (u) => u.clase === 'pct' ? { k: 100, suf: '%' } : (u.clase === 'mxn' && u.escala) ? { k: 1 / u.escala, suf: u.etiqueta || 'millones' } : { k: 1, suf: u.etiqueta || '' };
    const esNumTxt = (t) => t !== '' && t != null && isFinite(Number(String(t).replace('%', '')));
    const aUI = (t, cv) => esNumTxt(t) && String(t).indexOf('%') < 0 ? String(redondea(Number(t) * cv.k, 6)) : (t == null ? '' : String(t));
    const fmtDef = (v, u) => { if (!esNumTxt(v)) return String(v == null || v === '' ? '—' : v); const x = Number(String(v).replace('%', '')) * (String(v).indexOf('%') >= 0 ? 0.01 : 1); return fmt(u.clase === 'mxn' && u.escala ? x / u.escala : x, u.clase === 'mes' ? Object.assign({}, u, { etiqueta: 'meses' }) : u); };
    const fmtComp = (v, base) => esNumTxt(v) ? (base === 'pct' ? nf(Number(v) * 100, 1) + '% de la construcción' : base === 'n' ? nf(Number(v)) + ' unidades' : nf(Number(v), Number(v) % 1 ? 1 : 0) + ' m²') : String(v || '—');

    let contRg = 0;
    const abiertosRg = new Set(), abre = (k) => { abiertosRg.add(k); return k; };
    const dAbierto = (k) => abiertosRg.has(k) ? ' open' : '';
    on(panelEl, 'toggle', (e) => { const d = e.target, k = d && d.getAttribute && d.getAttribute('data-dk'); if (!k) return; if (d.open) abiertosRg.add(k); else abiertosRg.delete(k); }, true);
    function campo(etq, t, a, b, col, val, o) {
      o = o || {}; const k = [t, a, b || '', col].join('|'), er = errCampo && errCampo.k === k ? errCampo : null, v = er ? er.texto : (val == null ? '' : val), idc = 'rg' + (++contRg);
      const ctl = o.area ? '<textarea id="' + idc + '" rows="2" data-rg="' + esc(k) + '" data-rgt="txt">' + esc(v) + '</textarea>'
        : '<input id="' + idc + '" type="text" ' + (o.tipo ? 'inputmode="decimal" ' : '') + 'data-rg="' + esc(k) + '" data-rgt="' + (o.tipo || 'txt') + '"' + (o.m != null ? ' data-rgm="' + esc(o.m) + '"' : '') + ' value="' + esc(v) + '"' + (er ? ' aria-invalid="true" aria-describedby="' + idc + 'e"' : '') + '>';
      return '<div class="rg-c' + (er ? ' mal' : '') + '"><label for="' + idc + '">' + esc(etq) + (o.suf ? ' <small>(' + esc(o.suf) + ')</small>' : '') + '</label>' + ctl + (er ? '<p class="rg-err" id="' + idc + 'e" role="alert">' + esc(er.mensaje) + '</p>' : '') + '</div>';
    }
    function selectRg(etq, t, a, b, col, val, lista) {
      const k = [t, a, b || '', col].join('|'), er = errCampo && errCampo.k === k ? errCampo : null, idc = 'rg' + (++contRg);
      return '<div class="rg-c' + (er ? ' mal' : '') + '"><label for="' + idc + '">' + esc(etq) + '</label><select id="' + idc + '" data-rg="' + esc(k) + '" data-rgt="txt">' + lista.map((o) => '<option value="' + esc(o.v) + '"' + (o.v === val ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select>' + (er ? '<p class="rg-err" role="alert">' + esc(er.mensaje) + '</p>' : '') + '</div>';
    }
    function htmlReglas(n) {
      contRg = 0;
      if (!tablasAct) return '<section class="reglas"><p class="aviso">El editor necesita la definición en pestañas ARBOL_*; esta pantalla recibió otro formato.</p></section>';
      const T = 'ARBOL_NODOS', id = n.id, g = (c) => celda(T, { id }, c), u = unidadTabla(id), cv = convU(u), sinVista = !g('vista_a_factor');
      let h = '<section class="reglas" aria-label="Editar las reglas de este dato"><h3>Editar reglas de este dato <small>· borrador sin publicar</small></h3>';
      h += campo('Título', T, id, '', 'titulo', g('titulo'));
      if (n.tipo === 'se_decide') h += campo('Pregunta', T, id, '', 'pregunta', g('pregunta'), { area: true });
      h += campo('Texto que explica el dato', T, id, '', 'que_es', g('que_es'), { area: true });
      if (n.tipo === 'se_decide' || g('etiqueta_resultado')) h += campo('Rótulo del resultado', T, id, '', 'etiqueta_resultado', g('etiqueta_resultado'));
      if (n.tipo === 'se_busca') {
        h += campo('Dónde se confirma', T, id, '', 'confirma_en', g('confirma_en'), { area: true });
        h += campo('Dato de mercado que lo alimentaría', T, id, '', 'mercado_dato', g('mercado_dato'));
      }
      const refV = g('referencia_valor'), refO = g('referencia_opcion'), refF = g('referencia_origen'), ops = filasDe('ARBOL_OPCIONES', id), io = (f, c) => f[iCol(tablasAct.ARBOL_OPCIONES, c)];
      if (refV || refO || refF) {
        h += '<h4>Valor de referencia y su fuente</h4>';
        if (refO) h += selectRg('Opción de referencia', T, id, '', 'referencia_opcion', refO, ops.map((f) => ({ v: io(f, 'clave'), t: io(f, 'nombre') })));
        else if (sinVista && esNumTxt(refV)) h += campo('Valor de referencia', T, id, '', 'referencia_valor', aUI(refV, cv), { tipo: 'num', m: cv.k, suf: cv.suf });
        h += campo('De dónde sale la referencia', T, id, '', 'referencia_origen', refF, { area: true });
      }
      if (sinVista && esNumTxt(g('rango_min')) && esNumTxt(g('rango_max'))) {
        h += '<h4>Rango razonable</h4><div class="rg-tres">' + ['min', 'max', 'paso'].map((c) => campo(c === 'min' ? 'Mínimo' : c === 'max' ? 'Máximo' : 'Paso', T, id, '', 'rango_' + c, aUI(g('rango_' + c), cv), { tipo: 'num', m: cv.k })).join('') + '</div><p class="nota">En ' + esc(cv.suf || 'las unidades del dato') + '.</p>';
      } else if (!sinVista) h += '<p class="nota">El rango de este dato se mide en otra escala que la que se ve; se edita en el libro.</p>';
      /* opciones */
      if (ops.length) {
        const conValor = ops.some((f) => esNumTxt(io(f, 'valor'))), conFuente = ops.some((f) => io(f, 'fuente')), compuesto = (n.componentes || []).length > 0;
        h += '<h4>' + (compuesto ? 'Preajustes' : conFuente ? 'Fuentes' : 'Opciones') + '</h4><div class="rg-ops">';
        ops.forEach((f) => {
          const cl = io(f, 'clave');
          h += '<details class="rg-op" data-dk="' + esc('op|' + id + '|' + cl) + '"' + dAbierto('op|' + id + '|' + cl) + '><summary>' + esc(io(f, 'nombre')) + (conValor && esNumTxt(io(f, 'valor')) ? ' <i>' + esc(fmtDef(io(f, 'valor'), u)) + '</i>' : '') + '</summary>' +
            campo('Nombre', 'ARBOL_OPCIONES', id, cl, 'nombre', io(f, 'nombre')) +
            (conValor || esNumTxt(io(f, 'valor')) ? campo('Valor', 'ARBOL_OPCIONES', id, cl, 'valor', aUI(io(f, 'valor'), cv), { tipo: 'num', m: cv.k, suf: cv.suf }) : '') +
            campo('Lo que implica', 'ARBOL_OPCIONES', id, cl, 'implica', io(f, 'implica'), { area: true }) +
            (conFuente ? campo('De dónde sale (fuente)', 'ARBOL_OPCIONES', id, cl, 'fuente', io(f, 'fuente'), { area: true }) : '') +
            '<div class="fila">' + boton('rgquita:' + cl, 'rgq-' + cl, 'Quitar esta opción', 'ppp-btn chico') + '</div>' +
            (errCampo && errCampo.k === 'quita|' + id + '|' + cl ? '<p class="rg-err" role="alert">' + esc(errCampo.mensaje) + '</p>' : '') + '</details>';
        });
        h += '</div><details class="rg-op nuevo" data-dk="nuevo|' + id + '"' + dAbierto('nuevo|' + id) + '><summary>Agregar una opción</summary>' +
          '<div class="rg-c"><label>Nombre<input type="text" data-nuevo="nombre" maxlength="60"></label></div>' +
          (conValor ? '<div class="rg-c"><label>Valor <small>(' + esc(cv.suf) + ')</small><input type="text" inputmode="decimal" data-nuevo="valor"></label></div>' : '') +
          '<div class="rg-c"><label>Lo que implica<textarea rows="2" data-nuevo="implica"></textarea></label></div>' +
          (errCampo && errCampo.k === 'alta|' + id ? '<p class="rg-err" role="alert">' + esc(errCampo.mensaje) + '</p>' : '') +
          '<div class="fila">' + boton('rgalta', 'rgalta', 'Agregar la opción', 'ppp-btn') + '</div></details>';
      }
      /* componentes */
      const comps = filasDe('ARBOL_COMPONENTES', id), ic = (f, c) => f[iCol(tablasAct.ARBOL_COMPONENTES, c)];
      if (comps.length) {
        h += '<h4>Componentes del catálogo</h4><div class="rg-ops">';
        comps.forEach((f) => {
          const cl = ic(f, 'clave'), ub = ic(f, 'unidad_base'), k = ub === 'pct' ? 100 : 1, suf = ub === 'pct' ? '% de la construcción' : ub === 'n' ? 'unidades' : 'm²';
          h += '<details class="rg-op" data-dk="' + esc('comp|' + id + '|' + cl) + '"' + dAbierto('comp|' + id + '|' + cl) + '><summary>' + esc(ic(f, 'nombre')) + ' <i>' + esc(fmtComp(ic(f, 'cantidad'), ub)) + '</i></summary>' +
            campo('Nombre', 'ARBOL_COMPONENTES', id, cl, 'nombre', ic(f, 'nombre')) +
            campo('Tamaño', 'ARBOL_COMPONENTES', id, cl, 'cantidad', aUI(ic(f, 'cantidad'), { k }), { tipo: 'num', m: k, suf }) +
            (ub === 'n' ? campo('m² por unidad', 'ARBOL_COMPONENTES', id, cl, 'm2_por_unidad', ic(f, 'm2_por_unidad'), { tipo: 'num', m: 1, suf: 'm²' }) : '') +
            '<div class="rg-tres">' + ['min', 'max', 'paso'].map((c) => campo(c === 'min' ? 'Mínimo' : c === 'max' ? 'Máximo' : 'Paso', 'ARBOL_COMPONENTES', id, cl, c, aUI(ic(f, c), { k }), { tipo: 'num', m: k })).join('') + '</div>' +
            '<p class="nota">Unidad: ' + esc(suf) + ' (fija: es parte de cómo se calcula). El tamaño y el rango se editan en esa unidad.</p>' +
            '<div class="fila">' + boton('rgcquita:' + cl, 'rgcq-' + cl, 'Quitar del catálogo', 'ppp-btn chico') + '</div>' +
            (errCampo && errCampo.k === 'cquita|' + id + '|' + cl ? '<p class="rg-err" role="alert">' + esc(errCampo.mensaje) + '</p>' : '') + '</details>';
        });
        h += '</div><details class="rg-op nuevo" data-dk="nuevoc|' + id + '"' + dAbierto('nuevoc|' + id) + '><summary>Agregar un componente al catálogo</summary>' +
          '<div class="rg-c"><label>Nombre<input type="text" data-nuevoc="nombre" maxlength="60"></label></div>' +
          '<div class="rg-c"><label>Tamaño <small>(m²)</small><input type="text" inputmode="decimal" data-nuevoc="cantidad"></label></div>' +
          (errCampo && errCampo.k === 'calta|' + id ? '<p class="rg-err" role="alert">' + esc(errCampo.mensaje) + '</p>' : '') +
          '<div class="fila">' + boton('rgcalta', 'rgcalta', 'Agregar al catálogo', 'ppp-btn') + '</div></details>';
      }
      /* pruebas y alertas: texto y umbral */
      const tbR = tablasAct.ARBOL_REGLAS, als = tbR.slice(1).filter((f) => f[iCol(tbR, 'nodo')] === id && f[iCol(tbR, 'clase')] === 'alerta');
      if (als.length) {
        h += '<h4>' + (id.indexOf('RV-') === 0 ? 'Prueba y umbral' : 'Avisos de este dato') + '</h4>';
        als.forEach((f) => {
          const aid = f[iCol(tbR, 'id')], meta = f[iCol(tbR, 'meta')], pct = String(meta).indexOf('%') >= 0, nivel = f[iCol(tbR, 'nivel')] === 'alto' ? 'No pasa' : 'Aviso';
          h += '<div class="rg-al">' + campo(nivel + ': texto', 'ARBOL_REGLAS', aid, '', 'texto', f[iCol(tbR, 'texto')], { area: true });
          if (esNumTxt(meta)) h += campo('Umbral', 'ARBOL_REGLAS', aid, '', 'meta', pct ? String(redondea(Number(String(meta).replace('%', '')), 6)) : String(meta), { tipo: 'meta', m: pct ? 'pct' : 'num', suf: pct ? '%' : (u.etiqueta || '') });
          else if (/^RU-\d\d$/.test(String(meta).trim())) h += '<p class="nota">El umbral de esta prueba es un dato del plan («' + esc(tituloDe(String(meta).trim()) || 'umbral de la prueba') + '»). Cada plan puede escribir el suyo en «Riesgo y estado» (queda marcado como «umbral propio»); el valor del libro es su referencia.</p>';
          else if (meta) h += '<p class="nota">El umbral se calcula con otros datos del plan; es estructura y no se edita aquí.</p>';
          const libro = (motor.PRUEBAS_LIBRO || []).find((q) => q.id === id), vm = esNumTxt(meta) ? Number(String(meta).replace('%', '')) * (pct ? 0.01 : 1) : null;
          if (libro && vm !== null && Math.abs(vm - libro.umbral) > 1e-9) h += '<p class="aviso" role="status"><strong>Ojo:</strong> esta es una de las 9 pruebas de «revisión para fondos» del libro, que pide ' + esc(fmtDef(libro.umbral, u)) + '. Con otro umbral el aviso de aquí se comporta distinto que la prueba del visor, y Dirección tendría que aprobar esa diferencia antes de publicar. La prueba en «Riesgo y estado» usa el umbral del plan (el del libro, salvo que se cambie ahí).</p>';
          h += '</div>';
        });
        h += '<p class="nota">Si el texto lleva datos entre llaves, déjalos: ahí el árbol pone la cifra.</p>';
      }
      h += '<p class="nota estruc"><strong>Estructura (solo se ve):</strong> ' + esc((n.de_que_sale && n.de_que_sale.texto) || 'Este dato no sale de otros.') + ' Las fórmulas, las condiciones y de qué depende cada dato las define Dirección en el libro; aquí no se editan.</p></section>';
      return h;
    }

    /* aplicar un cambio de regla: todo pasa por editaDefinicion */
    const msgError = (e) => e ? String(e.mensaje || e.codigo || 'No se pudo aplicar el cambio.').replace(/^El cambio \d+: /, '') : 'No se pudo aplicar el cambio.';
    const msgErrorH = (e) => sinIds(msgError(e));
    const llaveCambio = (x) => x.accion === 'alta' ? 'alta|' + x.fila.nodo + '|' + x.fila.clave : x.accion === 'baja' ? 'baja|' + x.nodo + '|' + x.clave : [x.tabla, x.id || '', x.nodo || '', x.clave || '', x.columna].join('|');
    const mismoTxt = (a, b) => (a == null || a === '' ? '' : String(a)) === (b == null || b === '' ? '' : String(b)) || (esNumTxt(a) && esNumTxt(b) && String(a).indexOf('%') < 0 && String(b).indexOf('%') < 0 && Number(a) === Number(b));
    function fusiona(lista, c) {          // une un cambio de celda a la lista: el último gana y volver al valor original lo quita
      let out = lista.map((x) => x.accion === 'alta' ? { tabla: x.tabla, accion: 'alta', fila: Object.assign({}, x.fila) } : Object.assign({}, x));
      const alta = c.tabla === 'ARBOL_OPCIONES' || c.tabla === 'ARBOL_COMPONENTES' ? out.find((x) => x.accion === 'alta' && x.tabla === c.tabla && x.fila.nodo === c.nodo && x.fila.clave === c.clave) : null;
      if (alta) { alta.fila[c.columna] = c.valor; return out; }
      const k = llaveCambio(c), orig = celda(c.tabla, c.id !== undefined ? { id: c.id } : { nodo: c.nodo, clave: c.clave }, c.columna, true);
      out = out.filter((x) => llaveCambio(x) !== k);
      if (!mismoTxt(orig, c.valor)) out.push(c);
      return out;
    }
    function edoTarjetas() { const o = {}; ORDEN_TARJETAS.forEach((nm) => { const T = res.tarjetas[nm]; if (T) T.cifras.forEach((c) => { if (c.valor != null && !(c.id in o)) o[c.id] = { et: etiquetaCifra(c), txt: fmtCifra(c), v: c.valor }; }); }); return o; }
    function efectoDeCifras(antes, titulo) {
      const ahora = edoTarjetas(), partes = [];
      Object.keys(ahora).forEach((i) => { if (antes[i] && antes[i].txt !== ahora[i].txt && partes.length < 4) partes.push(ahora[i].et + ' ' + antes[i].txt + ' → ' + ahora[i].txt); });
      return { titulo, partes, regla: true };
    }
    function aplicaReglas(lista, k, texto, titulo) {
      const r = lista.length ? motor.editaDefinicion(DEF0, lista) : { ok: true, definicion: DEF0, filas_cambiadas: {}, errores: [] };      // sin cambios: la definición de origen tal cual (misma huella)
      if (!r.ok) { errCampo = k ? { k, texto, mensaje: msgErrorH(r.errores[0]) } : null; if (!k) ultimosErrores = [{ codigo: 'regla', mensaje: msgErrorH(r.errores[0]) }]; panel(); return false; }
      guardaActivo();
      const planes = cmp ? [cmp.A.plan, cmp.B.plan] : [plan], malos = [];
      const nuevos = planes.map((p) => { const rr = motor.evalua(r.definicion, p, null, SOLO_CIFRAS); if ((rr.errores || []).some((e) => /ya no existe/.test(e.mensaje || ''))) malos.push(sinIds(rr.errores[0].mensaje)); return rr.plan; });
      if (malos.length) { errCampo = k ? { k, texto, mensaje: 'Ese cambio dejaría sin sentido algo ya elegido en el plan: ' + malos[0] + ' Cambia primero esa decisión.' } : null; if (!k) ultimosErrores = [{ codigo: 'regla', mensaje: 'Eso deja sin sentido algo ya elegido: ' + malos[0] }]; panel(); return false; }
      const antes = edoTarjetas();
      cambiosRegla = lista; DEF = r.definicion; filasRegla = r.filas_cambiadas || {}; reconstruyeTablas(); ls.set(CL.reglas, JSON.stringify(cambiosRegla)); errCampo = null; ultimosErrores = [];
      if (cmp) { cmp.A.plan = nuevos[0]; cmp.B.plan = nuevos[1]; plan = cmp[cmp.activo].plan; } else plan = nuevos[0];
      res = motor.evalua(DEF, plan); plan = res.plan; if (cmp) cmp[cmp.activo].plan = plan; guarda();
      efecto = efectoDeCifras(antes, titulo || 'Regla cambiada');
      if (modoResumen) autoplegar([sel]);
      pintaTodo(false); pintaModo(); panel(); if (cmp) actualizaCmp(); asegurar(sel);
      anuncia((titulo || 'Regla cambiada') + '. El árbol se recalculó.');
      return true;
    }
    function numeroDeCampo(txt) { const t = String(txt).trim().replace(/\s/g, '').replace(/,/g, '.'); return t !== '' && isFinite(Number(t)) ? Number(t) : null; }
    function editaCampo(t, rg) {
      const [tabla, a, b, col] = rg.split('|'), tipo = t.getAttribute('data-rgt') || 'txt', m = t.getAttribute('data-rgm');
      const txt = t.value; let def = txt;
      if (tipo === 'num' || tipo === 'meta') {
        const x = numeroDeCampo(txt);
        if (x == null) { errCampo = { k: rg, texto: txt, mensaje: 'Escribe un número, por ejemplo 12.5.' }; panel(); return; }
        def = tipo === 'num' ? redondea(x / Number(m), 10) : (m === 'pct' ? redondea(x, 6) + '%' : redondea(x, 6));
      } else def = txt.trim();
      const c = tabla === 'ARBOL_OPCIONES' || tabla === 'ARBOL_COMPONENTES' ? { tabla, nodo: a, clave: b, columna: col, valor: def } : { tabla, id: a, columna: col, valor: def };
      const antesTxt = celda(tabla, c.id !== undefined ? { id: a } : { nodo: a, clave: b }, col);
      if (mismoTxt(antesTxt, def) && !(tipo === 'txt' && String(antesTxt || '') !== def)) { errCampo = null; panel(); return; }
      aplicaReglas(fusiona(cambiosRegla, c), rg, txt, 'Cambiaste ' + (NOM_COL[col] || col) + ' de «' + (tituloOrig(a, tabla) || a) + '»');
    }
    const tituloOrig = (id, tabla) => { const nid = tabla === 'ARBOL_REGLAS' ? celda('ARBOL_REGLAS', { id }, 'nodo', true) : id; return celda('ARBOL_NODOS', { id: nid }, 'titulo', true); };
    const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'nueva';
    function claveLibre(tabla, nodo, base) { const tb = tablasAct[tabla], ik = iCol(tb, 'clave'), inn = iCol(tb, 'nodo'); let k = base, i = 2; while (tb.some((f) => f[inn] === nodo && f[ik] === k)) k = base + '_' + (i++); return k; }
    function altaOpcion(n) {
      const g = (q) => { const e = panelEl.querySelector('[data-nuevo="' + q + '"]'); return e ? e.value.trim() : ''; };
      const nombre = g('nombre'), valor = g('valor'), implica = g('implica'), u = unidadTabla(n.id), cv = convU(u);
      const falla = (m) => { errCampo = { k: 'alta|' + n.id, mensaje: m }; abre('nuevo|' + n.id); panel(); };
      if (!nombre) return falla('La opción necesita un nombre.');
      const pideValor = filasDe('ARBOL_OPCIONES', n.id).some((f) => esNumTxt(f[iCol(tablasAct.ARBOL_OPCIONES, 'valor')]));
      let v = ''; if (pideValor) { const x = numeroDeCampo(valor); if (x == null) return falla('Escribe el valor de la opción como número.'); v = redondea(x / cv.k, 10); }
      const fila = { nodo: n.id, clave: claveLibre('ARBOL_OPCIONES', n.id, slug(nombre)), nombre, implica, valor: v };
      aplicaReglas(cambiosRegla.concat([{ tabla: 'ARBOL_OPCIONES', accion: 'alta', fila }]), 'alta|' + n.id, '', 'Agregaste la opción «' + nombre + '» a «' + tituloOrig(n.id) + '»');
    }
    function quitaOpcion(n, cl) {
      if (n.estado === 'decidido' && n.opcion === cl) { errCampo = { k: 'quita|' + n.id + '|' + cl, mensaje: 'Esta opción es la que está elegida: elige otra antes de quitarla.' }; abre('op|' + n.id + '|' + cl); panel(); return; }
      let lista = cambiosRegla.filter((x) => !(x.tabla === 'ARBOL_OPCIONES' && ((x.accion === 'alta' && x.fila.nodo === n.id && x.fila.clave === cl) || (x.accion !== 'alta' && x.nodo === n.id && x.clave === cl))));
      const eraAlta = lista.length !== cambiosRegla.length && cambiosRegla.some((x) => x.accion === 'alta' && x.tabla === 'ARBOL_OPCIONES' && x.fila.nodo === n.id && x.fila.clave === cl);
      if (!eraAlta) lista = lista.concat([{ tabla: 'ARBOL_OPCIONES', accion: 'baja', nodo: n.id, clave: cl }]);
      const nom = celda('ARBOL_OPCIONES', { nodo: n.id, clave: cl }, 'nombre') || cl;
      aplicaReglas(lista, 'quita|' + n.id + '|' + cl, '', 'Quitaste la opción «' + nom + '» de «' + tituloOrig(n.id) + '»');
    }
    function altaComponente(n) {
      const g = (q) => { const e = panelEl.querySelector('[data-nuevoc="' + q + '"]'); return e ? e.value.trim() : ''; };
      const nombre = g('nombre'), x = numeroDeCampo(g('cantidad')), falla = (m) => { errCampo = { k: 'calta|' + n.id, mensaje: m }; abre('nuevoc|' + n.id); panel(); };
      if (!nombre) return falla('El componente necesita un nombre.');
      if (x == null || x < 0) return falla('Escribe el tamaño en m² (un número de 0 en adelante).');
      const fila = { nodo: n.id, clave: claveLibre('ARBOL_COMPONENTES', n.id, slug(nombre)), nombre, rol: 'no_vendible', unidad_base: 'm2', cantidad: x, min: 0, max: Math.max(300, Math.ceil(x * 3 / 5) * 5), paso: 5, activo_ref: 'no', fuente: 'Agregado desde la pantalla (borrador): falta confirmarlo con un arquitecto.' };
      aplicaReglas(cambiosRegla.concat([{ tabla: 'ARBOL_COMPONENTES', accion: 'alta', fila }]), 'calta|' + n.id, '', 'Agregaste el componente «' + nombre + '» al catálogo de «' + tituloOrig(n.id) + '»');
    }
    function quitaComponente(n, cl) {
      const enUso = (n.componentes || []).find((c) => c.clave === cl && c.activo);
      if (enUso) { errCampo = { k: 'cquita|' + n.id + '|' + cl, mensaje: 'Este componente está encendido en el edificio: quítalo primero del edificio (en «Componentes») y luego del catálogo.' }; abre('comp|' + n.id + '|' + cl); panel(); return; }
      const eraAlta = cambiosRegla.some((x) => x.accion === 'alta' && x.tabla === 'ARBOL_COMPONENTES' && x.fila.nodo === n.id && x.fila.clave === cl);
      let lista = cambiosRegla.filter((x) => !(x.tabla === 'ARBOL_COMPONENTES' && ((x.accion === 'alta' && x.fila.nodo === n.id && x.fila.clave === cl) || (x.accion !== 'alta' && x.nodo === n.id && x.clave === cl))));
      if (!eraAlta) lista = lista.concat([{ tabla: 'ARBOL_COMPONENTES', accion: 'baja', nodo: n.id, clave: cl }]);
      const nom = celda('ARBOL_COMPONENTES', { nodo: n.id, clave: cl }, 'nombre') || cl;
      aplicaReglas(lista, 'cquita|' + n.id + '|' + cl, '', 'Quitaste «' + nom + '» del catálogo de «' + tituloOrig(n.id) + '»');
    }

    /* modo y lista de cambios */
    function pintaModo() {
      const n = cambiosRegla.length;
      host.querySelector('[data-act="editar"]').setAttribute('aria-pressed', String(editar));
      ppp.toggleAttribute('data-editar', editar);
      if (!editar && !n) { modoEl.hidden = true; modoEl.innerHTML = ''; return; }
      modoEl.hidden = false; modoEl.classList.toggle('on', editar);
      modoEl.innerHTML = '<span class="m-t">' + (editar ? 'Editando reglas · borrador sin publicar' : 'Reglas con cambios · borrador sin publicar') + '</span><button type="button" class="ppp-btn chico" data-act="vercambios">Cambios (' + n + ')</button>';
      ppp.toggleAttribute('data-editar', editar);
    }
    function descCambio(x) {
      if (x.accion === 'alta') {
        const f = x.fila, esOp = x.tabla === 'ARBOL_OPCIONES', u = unidadTabla(f.nodo);
        return { que: (esOp ? 'Opción nueva «' : 'Componente nuevo «') + f.nombre + '» en «' + tituloOrig(f.nodo) + '»', de: '—', a: esOp ? (esNumTxt(f.valor) ? fmtDef(f.valor, u) : f.nombre) : fmtComp(f.cantidad, f.unidad_base) };
      }
      if (x.accion === 'baja') {
        const esOp = x.tabla === 'ARBOL_OPCIONES', nom = celda(x.tabla, { nodo: x.nodo, clave: x.clave }, 'nombre', true) || x.clave;
        return { que: (esOp ? 'Opción quitada «' : 'Componente quitado del catálogo «') + nom + '» de «' + tituloOrig(x.nodo) + '»', de: nom, a: '—' };
      }
      const id = x.id || x.nodo, orig = celda(x.tabla, x.id !== undefined ? { id: x.id } : { nodo: x.nodo, clave: x.clave }, x.columna, true), colN = NOM_COL[x.columna] || x.columna;
      const nodoId = x.tabla === 'ARBOL_REGLAS' ? celda('ARBOL_REGLAS', { id: x.id }, 'nodo', true) : id, u = unidadTabla(nodoId);
      let q = colN + ' · «' + (tituloOrig(x.id || x.nodo, x.tabla) || '') + '»', de = orig, a = x.valor;
      if (x.tabla === 'ARBOL_OPCIONES') { const nom = celda(x.tabla, { nodo: x.nodo, clave: x.clave }, 'nombre', true) || x.clave; q = colN + ' de la opción «' + nom + '» · «' + tituloOrig(x.nodo) + '»'; if (x.columna === 'valor') { de = fmtDef(orig, u); a = fmtDef(x.valor, u); } }
      else if (x.tabla === 'ARBOL_COMPONENTES') { const nom = celda(x.tabla, { nodo: x.nodo, clave: x.clave }, 'nombre', true) || x.clave, ub = celda(x.tabla, { nodo: x.nodo, clave: x.clave }, 'unidad_base', true); q = colN + ' del componente «' + nom + '» · «' + tituloOrig(x.nodo) + '»'; if (['cantidad', 'min', 'max', 'paso'].indexOf(x.columna) >= 0) { de = fmtComp(orig, ub); a = fmtComp(x.valor, ub); } }
      else if (x.tabla === 'ARBOL_REGLAS') { q = colN + ' del aviso de «' + tituloOrig(x.id, x.tabla) + '»'; if (x.columna === 'meta') { de = fmtDef(orig, u); a = fmtDef(x.valor, u); } }
      else if (['referencia_valor', 'rango_min', 'rango_max', 'rango_paso'].indexOf(x.columna) >= 0) { de = fmtDef(orig, u); a = fmtDef(x.valor, u); }
      return { que: q.charAt(0).toUpperCase() + q.slice(1), de: de === '' || de == null ? '—' : de, a: a === '' || a == null ? '—' : a };
    }
    function etiquetaFila(t, clave) {
      if (t === 'ARBOL_NODOS') return celda(t, clave, 'titulo') || clave.id;
      if (t === 'ARBOL_REGLAS') return 'aviso de «' + (tituloOrig(clave.id, t) || clave.id) + '»';
      if (t === 'ARBOL_OPCIONES') return (tituloOrig(clave.nodo) || clave.nodo) + ' · ' + (celda(t, clave, 'nombre') || clave.clave);
      if (t === 'ARBOL_COMPONENTES') return (tituloOrig(clave.nodo) || clave.nodo) + ' · ' + (celda(t, clave, 'nombre') || clave.clave);
      return Object.values(clave).join(' · ');
    }
    /* Ola 6 (G3): lo que se exporta para pegar en el libro nunca debe volverse fórmula. Misma regla que textoSeguro de conexion.js: un texto que empieza con = + - @ ' (aunque traiga espacio delante) lleva un apóstrofo antes; los números escritos como texto («-0.5») se dejan tal cual. */
    function celdaSegura(t) { return /^\s*[=+\-@']/.test(t) && !/^\s*[-+]?\d+([.,]\d+)?\s*%?\s*$/.test(t) ? "'" + t : t; }
    function textoPestanas() {
      const out = [];
      Object.keys(filasRegla).forEach((t) => {
        const lista = filasRegla[t], tb = tablasAct && tablasAct[t], th = tablas0 && tablas0[t]; if (!th) return;
        const filas = [], notas = [];
        lista.forEach((f) => {
          if (f.accion === 'baja') { notas.push('Borrar la fila ' + f.fila + ' (' + (Object.values(f.clave).join(' · ')) + ').'); return; }
          const row = tb && buscaFila(tb, t, f.clave); if (!row) return;
          filas.push({ fila: f.accion === 'alta' ? null : f.fila, txt: row.map((c) => celdaSegura(String(c == null ? '' : c).replace(/[\t\r\n]+/g, ' '))).join('\t'), clave: etiquetaFila(t, f.clave), alta: f.accion === 'alta' });
        });
        out.push({ pestana: t, cabecera: th[0].join('\t'), filas, notas });
      });
      return out;
    }
    function textoResumen(past) {
      const L = ['Cambios a las reglas del Árbol PPP · borrador sin publicar', 'Fecha: ' + new Date().toISOString().slice(0, 10), 'Este texto lo genera la pantalla; NO escribe en Sheets. Pega cada bloque en la pestaña indicada del libro «PPP Maestro»; solo Dirección publica.', ''];
      cambiosRegla.forEach((x) => { const d = descCambio(x); L.push('• ' + d.que + ': ' + d.de + ' → ' + d.a); });
      L.push('');
      past.forEach((p) => { L.push(p.pestana + ': ' + (p.filas.filter((f) => f.fila).length ? 'reemplazar las filas ' + p.filas.filter((f) => f.fila).map((f) => f.fila).join(', ') + ' completas' : '') + (p.filas.some((f) => f.alta) ? (p.filas.some((f) => f.fila) ? '; ' : '') + 'agregar ' + p.filas.filter((f) => f.alta).length + ' fila(s) al final' : '') + '.'); p.notas.forEach((q) => L.push('  ' + q)); });
      return L.join('\n');
    }
    function panelReglas() {
      const n = cambiosRegla.length;
      let h = '<h2 tabindex="-1" data-foco>Cambios a las reglas ' + chip(n + (n === 1 ? ' cambio' : ' cambios'), n ? 'punteado' : '') + '</h2><p class="nota">Borrador sin publicar: vive en esta sesión (y en este navegador). La pantalla no escribe en el libro; «Exportar» arma el texto para pegarlo allí.</p>';
      if (!n) return h + '<p class="aviso info" role="status">Todavía no cambiaste ninguna regla. Activa «Editar reglas», abre cualquier dato y cambia lo que necesites.</p>';
      h += '<ul class="cambios">' + cambiosRegla.map((x, i) => { const d = descCambio(x); return '<li class="cb"><p class="cb-q">' + esc(d.que) + '</p><p class="cb-v"><s>' + esc(d.de) + '</s> → <strong>' + esc(d.a) + '</strong></p>' + boton('rgundo:' + i, 'rgundo-' + i, 'Deshacer este cambio', 'ppp-btn chico') + '</li>'; }).join('') + '</ul>';
      h += '<div class="fila">' + boton('rgtodo', 'rgtodo', 'Volver a la definición original', 'ppp-btn nose') + boton('rgexporta', 'rgexporta', verExport ? 'Ocultar la exportación' : 'Exportar', 'ppp-btn') + '</div>';
      if (errCampo && errCampo.k === 'cambios') h += '<p class="rg-err" role="alert">' + esc(errCampo.mensaje) + '</p>';
      if (verExport) {
        const past = textoPestanas(), resumen = textoResumen(past);
        h += '<div class="export"><h3>Resumen legible</h3><textarea readonly rows="8" data-exp="resumen" aria-label="Resumen legible de los cambios">' + esc(resumen) + '</textarea><div class="fila">' + boton('copia:resumen', 'cp-resumen', 'Copiar el resumen', 'ppp-btn chico') + '</div>';
        past.forEach((p, i) => {
          const txt = p.cabecera + '\n' + p.filas.map((f) => f.txt).join('\n');
          h += '<h3>' + esc(p.pestana) + '</h3><p class="nota">' + (p.filas.length ? p.filas.map((f) => f.alta ? 'fila nueva al final (' + esc(f.clave) + ')' : 'fila ' + f.fila + ' (' + esc(f.clave) + ')').join(' · ') : 'solo borrados') + '. Separado por tabuladores, con encabezado.</p>' + p.notas.map((q) => '<p class="nota">' + esc(q) + '</p>').join('') +
            (p.filas.length ? '<textarea readonly rows="' + Math.min(8, 2 + p.filas.length) + '" wrap="off" data-exp="p' + i + '" aria-label="Filas cambiadas de ' + esc(p.pestana) + ', separadas por tabulador">' + esc(txt) + '</textarea><div class="fila">' + boton('copia:p' + i, 'cp-p' + i, 'Copiar ' + esc(p.pestana), 'ppp-btn chico') + '</div>' : '');
        });
        h += '<div class="fila">' + boton('copia:todo', 'cp-todo', 'Copiar todo', 'ppp-btn') + '<span class="nota" data-copiado role="status"></span></div></div>';
      }
      return h;
    }
    function copiar(que) {
      const past = textoPestanas();
      const cual = que === 'resumen' ? textoResumen(past) : que === 'todo' ? textoResumen(past) + '\n\n' + past.map((p) => '### ' + p.pestana + '\n' + p.cabecera + '\n' + p.filas.map((f) => f.txt).join('\n')).join('\n\n') : (() => { const p = past[+que.slice(1)]; return p ? p.cabecera + '\n' + p.filas.map((f) => f.txt).join('\n') : ''; })();
      const aviso = (t) => { const e = panelEl.querySelector('[data-copiado]'); if (e) e.textContent = t; };
      const area = panelEl.querySelector('[data-exp="' + (que === 'todo' ? 'resumen' : que) + '"]');
      try { if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(cual).then(() => aviso('Copiado.'), () => { if (area) { area.focus(); area.select(); } aviso('No pude copiar solo: el texto quedó seleccionado, cópialo con tu teclado.'); }); return; } } catch (e) { /* sin portapapeles */ }
      if (area) { area.focus(); area.select(); } aviso('Texto seleccionado: cópialo con tu teclado.');
    }
    function deshacerCambioRegla(i) {
      const lista = cambiosRegla.filter((_, j) => j !== i);
      if (aplicaReglas(lista, null, '', 'Deshiciste un cambio de regla')) { vista = 'reglas'; panel(); }
    }
    function volverOriginal() {
      if (!aplicaReglas([], null, '', 'Volviste a la definición original')) return;
      vista = 'reglas'; verExport = false; panel();
    }
    function panelLista() {
      let h = '<h2 tabindex="-1" data-foco>Todo el plan en lista ' + chip(res.nodos.length + ' datos') + '</h2><p class="nota">Cada renglón es un dato ya desbloqueado, agrupado por la tarjeta que alimenta. Toca uno para verlo en el árbol.</p>';
      ORDEN_TARJETAS.forEach((nm) => {
        const ns = res.nodos.filter((n) => ((n.tarjetas || [])[0] || 'Terreno') === nm); if (!ns.length) return;
        h += '<h3 class="lt" style="--c:var(--' + SLUG[nm] + ')">' + esc(nm) + ' <small>' + ns.length + '</small></h3><ul class="lista">' + ns.map((n) => {
          const est = n.estado == null ? (n.tipo === 'calculado' ? (n.heredado === 'firme' ? 'firme' : 'estimado') : 'te toca decidir') : ESTADO_TXT[n.estado];
          return '<li>' + boton('ir:' + n.id, 'li-' + n.id, '<span class="l-t">' + esc(n.titulo) + (esRojo(n) ? ' <em class="rj" aria-label="en rojo">!</em>' : '') + '</span><span class="l-v">' + esc(textoValor(n)) + '</span><span class="l-e">' + esc(TIPO_TXT[n.tipo] + ' · ' + est) + '</span>', 'li-b' + (esRojo(n) ? ' rojo' : ''), ' aria-label="' + esc(n.titulo + ': ' + textoValor(n) + '. ' + est + (esRojo(n) ? '. En rojo: no pasa.' : '')) + '"') + '</li>';
        }).join('') + '</ul>';
      });
      return h;
    }

    /* ----- tamaño ----- */
    function mide() { const primera = !vw; if (!remide()) return; if (primera) vistaInicial(); else pon(cam); }
    let ro = null;
    on(root, 'resize', ajustaCifras);
    try { if (root.document.fonts && root.document.fonts.ready) root.document.fonts.ready.then(() => { if (host.__ppp) ajustaCifras(); }); } catch (e) { /* sin API de tipografías */ }
    if (root.ResizeObserver) { ro = new root.ResizeObserver(() => mide()); ro.observe(lienzo); } else on(root, 'resize', mide);

    /* ----- arranque ----- */
    const hayCmp = restauraCmp();
    sel = res.abiertas[0] || (res.nodos[0] && res.nodos[0].id);
    autoplegar([sel]);
    pintaTodo(); tgt.forEach((p, id) => disp.set(id, { x: p.x, y: p.y })); anim.lay = null; coloca(); mide(); pintaModo();
    if (hayCmp) { actualizaCmp(); fijaVista(cmp.ver); }

    const api = {
      destruir() { escucha.forEach(([t, ev, fn, o]) => t.removeEventListener(ev, fn, o)); if (ro) ro.disconnect(); cancelAnimationFrame(raf); temporizadores.forEach(clearTimeout); delete host.__ppp; host.innerHTML = ''; },
      reiniciar, seleccionar, alterna, verTodo, centrar, decide, deshacer, abreAlerta, verPrueba, avisoArbol,
      comparacion: () => cmp ? { activo: cmp.activo, ver: cmp.ver, rotA: cmp.rotA, rotB: cmp.rotB, planA: cmp.A.plan, planB: cmp.B.plan, cambios: cmp.datos && cmp.datos.cambios, omitidas: cmp.datos && cmp.datos.omitidas, igual: cmp.datos && cmp.datos.igual, veredicto: cmp.datos && cmp.datos.c && cmp.datos.c.veredicto, aportes: cmp.datos && cmp.datos.c && cmp.datos.c.aportes, medidas: cmp.datos && cmp.datos.c && cmp.datos.c.medidas } : null,
      reglas: () => ({ editar, cambios: JSON.parse(JSON.stringify(cambiosRegla)), huella: DEF.huella, huella0: DEF0.huella, filas: JSON.parse(JSON.stringify(filasRegla)) }),
      estado: () => ({ sel, vista, plan, res, plegados: [...plegados], camara: Object.assign({}, cam), tam: { vw, vh }, caja: bbox, animando: !!(anim.cam || anim.lay), ruta: ruta ? { alertas: ruta.alertas.slice(), nodos: [...ruta.nodos], aristas: [...ruta.aristas], ok: ruta.ok } : null, historia: historia.length, resumen: modoResumen, visibles: visibles.map((n) => n.id) }),
      posicion: (id) => { const p = disp.get(id); return p ? { x: p.x * cam.k + cam.x, y: p.y * cam.k + cam.y } : null; },
      presentacion: () => (res.presentacion ? JSON.parse(JSON.stringify(res.presentacion)) : null),
      motor, DEF,
    };
    host.__ppp = api;
    return api;
  }

  root.ArbolPantalla = { montar, fmt, textoCifras, etiquetaCifra, clavesAlmacen };
})(typeof window !== 'undefined' ? window : this);
