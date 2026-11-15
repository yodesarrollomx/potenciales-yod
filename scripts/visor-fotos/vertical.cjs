'use strict';
/**
 * Motor VERTICAL (mixto.html) → foto del visor.
 *
 * Dos vías, una sola traducción:
 *
 *  1. LIBRO NATIVO (origen `libro`). Si el caso trae `caso.libro` (lo que se leyó de su libro en Google Sheets,
 *     listado en PPP_LIBROS), la foto se COPIA del libro sin recalcular: las columnas F/G de la hoja de cada
 *     versión (etiqueta con el nombre de `computar()` → valor calculado) y el bloque mensual J:AI, leído por
 *     etiqueta. Es lo mismo que el tablero enseña en modo nativo (`acceptSheetModel` pinta `m.estados[...]`,
 *     que el backend arma de esas celdas). Una versión por renglón de la pestaña `Versiones` del libro, en su
 *     orden. Los dos formatos de hoja conocidos (`Version_Base`/`Vnn_<id>`, sin encabezado en la fila 6, y
 *     `*_Integral`, con encabezado) tienen las mismas etiquetas en F y las mismas columnas en J:AI; si la fila
 *     de encabezado viene, se usa, y si no, se usa `FLUJO_LIBRO`.
 *
 *  2. LOTE (origen `lote`), para casos sin libro: el `computar(vals)` real cortado del HTML, con las entradas
 *     que vería el navegador: valores por defecto → in* del renglón (aplicarCasoRemoto) → reinicios de
 *     `escAplicar` + inputs de la versión → `clampRelations` → computar.
 *
 * `caso.libro` (lo arma quien lee el libro; aquí no hay red):
 *   { modelo: 'vertical-volumes-v2', revision?: '…',
 *     versiones: [{escenario_id, nombre, es_base, activo, hoja, estado}],         ← pestaña Versiones
 *     hojas: { <hoja>: { resultados: {etiqueta: valor} | [[etiqueta, valor], …],  ← F8:G…
 *                        flujo: { encabezado: [..26..] | null, filas: [[…], …] } } } ← J6:AI…
 *   Los valores pueden venir como número (effectiveValue) o como texto con formato es-MX ("1.234,56",
 *   "(1.234)", "–" = 0).
 *
 * Correspondencias (sólo renombrar; nombres de `computar()`, que son también las etiquetas del libro):
 *   ventas = sales · costo del proyecto = projectCost · utilidad = profit (lo mismo que `resumenActual()`)
 *   v.tierra = land · v.costo_sin_tierra = projectCost − land   ← la única resta, permitida por el contrato
 *   v.costo_dinero = interest + feeDebt (la misma suma que `resumenActual().intereses_mas_fee`)
 *   v.ganancia = profit · v.margen = margin
 *   v.banco_max = peak · v.banco_mes = peakMonth · v.capital = equityUsed · v.respaldo = fundingGap
 *   v.caja_cierre = cash · v.resultado_repartir = distributable
 *   v.obra_inicio = buildStart + 1 y v.fin_obra = buildFinish   (el motor cuenta meses desde 0; el visor desde 1)
 *   v.mes_saldos = totalMonths − delivery + 1   (el primer mes del bucle de saldos del motor, en base 1)
 *   v.ultimo_cobro = v.mes_reparto = v.dueno_meses = totalMonths (cobro final y reparto al cierre)
 *   v.dueno_aporta = ownerCapital · v.dueno_recibe = ownerTotalProceeds (= resultado_dueno del resumen)
 *   v.dueno_veces = ownerMoic · v.alianza_recibe = devGain (lo que el desarrollador recibe ENCIMA de su capital,
 *   = devDist − devCapital, dato del motor). No devDist: el visor ya pinta aparte que el capital (v.capital)
 *   se recupera, y devDist lo trae dentro; con devDist el capital se contaría dos veces.
 *   reparto.tasa_capital = p.pref · reparto.parte_dueno = effectiveOwnerResidual
 *   flujo: rev→cobranza · cost→egresos · equity→cap_aporta · pik→interes · fee→apertura · debt→saldo_banco ·
 *          gap→respaldo · caja→caja; del libro, además: Desembolso→disposicion · Pago deuda→pago_banco ·
 *          Equity acumulado→cap_acum (computar no los da por mes, así que en lote no se entregan).
 *   productos: deptos A/B/C (unidades y m² del motor, $/m² de lista; SIN ventas por tipología, el motor no
 *              las tiene), locales (comSell, preCom, comRev) y cajones vendibles (spacesVenta, precioCajon,
 *              parkingRev).
 *
 * Lo que este motor no tiene (null o no se entrega, nunca 0): max_ajeno, inversion_recibe, rend_capital,
 * capital_mes, respaldo_mes, pagos_obra, firmas y el resto de series mensuales del PPP 2, din.tiie,
 * din.sobretasa, din.caja_pct, revisión para fondos (rv_*, ck_*), candados y edad.
 */

const TIPO = 'VERTICAL';

/* Los reinicios de `escAplicar` antes de aplicar los inputs de una versión. */
const REINICIOS_ESC = ['inInventarioExplicito', 'inUnidadesA', 'inUnidadesB', 'inUnidadesC', 'inComRentableExacto',
  'inCajonesResidExactos', 'inSotanoAreaExacta', 'inObraDirectaTotal', 'inIndirectosTotal'];

/* Encabezado de J6:AI6 de las hojas de versión (tal cual lo escribe la hoja `*_Integral`). */
const FLUJO_LIBRO = ['Mes', 'Curva obra', 'Cobros', 'Costo', 'Deuda inicial', 'Caja inicial', 'Brecha inicial', 'Interés',
  'PIK capital', 'Interés efectivo', 'Equity', 'Caja + equity', 'Desembolso', 'Comisión deuda', 'Deuda previa pago',
  'Pago deuda', 'Caja después deuda', 'Brecha nueva', 'Cura brecha', 'Deuda final', 'Caja final', 'Brecha final',
  'Flujo desarrollador', 'Flujo dueño', 'Preferencia developer', 'Equity acumulado'];
/* Columna del libro → campo de `flows` de computar(). */
const COL_FLUJO = { m: 'Mes', rev: 'Cobros', cost: 'Costo', equity: 'Equity', pik: 'Interés', fee: 'Comisión deuda',
  gap: 'Brecha nueva', debt: 'Deuda final', caja: 'Caja final', draw: 'Desembolso', repay: 'Pago deuda', equityAcum: 'Equity acumulado' };
const RE_ESC = /^[A-Za-z0-9_-]{1,40}$/;

/* ───────────── lectura de números del libro ───────────── */
/* Número desde lo que dé la API: número, booleano o texto con formato es-MX. Celda vacía → null. */
function numeroLibro(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (x === null || x === undefined) return null;
  let s = String(x).trim();
  if (s === '') return null;
  if (/^(TRUE|VERDADERO)$/i.test(s)) return 1;
  if (/^(FALSE|FALSO)$/i.test(s)) return 0;
  if (/^[–—-]$/.test(s)) return 0;                                  // así pinta el cero el formato contable
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$\s%]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');  // 3.837 con miles es-MX
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}
/* F/G de una hoja de versión → {etiqueta: número}. Las etiquetas `p.algo` quedan dentro de `p`. */
function resultadosDeLibro(resultados) {
  const pares = Array.isArray(resultados) ? resultados : Object.entries(resultados || {});
  const r = { p: {} };
  pares.forEach(par => {
    const k = par && par[0] !== undefined && par[0] !== null ? String(par[0]).trim() : '';
    if (!k) return;
    const v = numeroLibro(par[1]);
    if (k.startsWith('p.')) r.p[k.slice(2)] = v; else r[k] = v;
  });
  return r;
}
/* J:AI de una hoja de versión → `flows` con los nombres de computar(), hasta `meses` renglones. */
function flujoDeLibro(flujo, meses) {
  const f = flujo || {};
  const enc = Array.isArray(f.encabezado) && f.encabezado.some(x => String(x || '').trim()) ? f.encabezado.map(x => String(x || '').trim()) : FLUJO_LIBRO;
  const idx = {};
  Object.keys(COL_FLUJO).forEach(k => { idx[k] = enc.indexOf(COL_FLUJO[k]); });
  ['m', 'rev', 'cost', 'equity', 'pik', 'debt', 'caja'].forEach(k => { if (idx[k] < 0) throw new Error('El flujo del libro no trae la columna «' + COL_FLUJO[k] + '».'); });
  const filas = (f.filas || []).filter(fila => Array.isArray(fila) && numeroLibro(fila[idx.m]) !== null);
  /* Una columna que no trae ningún número no existe para el visor (null), en vez de una serie de ceros. */
  const conDato = {};
  Object.keys(idx).forEach(k => { conDato[k] = idx[k] >= 0 && filas.some(fila => numeroLibro(fila[idx[k]]) !== null); });
  const flows = filas.map(fila => {
    const o = {};
    Object.keys(idx).forEach(k => { o[k] = !conDato[k] ? null : (numeroLibro(fila[idx[k]]) ?? 0); });
    return o;
  });
  const n = Number(meses);
  if (Number.isFinite(n) && n > 0) {
    if (flows.length < n) throw new Error('El flujo del libro trae ' + flows.length + ' meses y totalMonths dice ' + n + '.');
    return flows.slice(0, n);
  }
  return flows;
}
/* Que lo copiado sea coherente consigo mismo (no es un cálculo nuevo: sólo compara dos celdas del mismo libro). */
function revisaLibro(r, flows) {
  const suma = k => flows.reduce((s, f) => s + (f[k] || 0), 0);
  const cerca = (a, b) => a !== null && b !== null && Math.abs(a - b) <= Math.max(1000, 0.001 * Math.abs(b));
  const malos = [];
  if (!cerca(suma('rev'), r.revTotal)) malos.push('Cobros ≠ revTotal');
  if (!cerca(suma('cost'), r.costTotal)) malos.push('Costo ≠ costTotal');
  if (!cerca(suma('equity'), r.equityUsed)) malos.push('Equity ≠ equityUsed');
  if (!cerca(suma('pik'), r.interest)) malos.push('Interés ≠ interest');
  if (flows.length && !cerca(flows[flows.length - 1].caja, r.cash)) malos.push('Caja final ≠ cash');
  if (malos.length) throw new Error('El libro no cuadra consigo mismo: ' + malos.join('; ') + '.');
}

/* ───────────── versiones ───────────── */
/* Con libro: las de su pestaña Versiones, en su orden (la última es la más nueva). `activa` = la versión
   activa del RENGLÓN (la única que tiene resumen guardado contra qué conciliar), no la del libro; la del
   libro va aparte en `libroActiva`. Sin libro: las de escenarios_json (núcleo). */
function versiones(caso, ctx) {
  const N = ctx.nucleo;
  const libro = caso && caso.libro;
  if (!libro || !Array.isArray(libro.versiones) || !libro.versiones.length) return N.versionesDeRenglon(caso && caso.renglon);
  const actRenglon = N.leeEscenarios(caso.renglon && caso.renglon.escenarios_json).activo;
  const idActivo = actRenglon ? actRenglon.id : null;
  return libro.versiones.filter(x => x && (x.escenario_id || x.hoja)).map((x, i) => {
    const id = x.escenario_id && RE_ESC.test(String(x.escenario_id)) ? String(x.escenario_id) : 'v' + (i + 1);
    return {
      id, nombre: String(x.nombre || 'Versión').slice(0, 40), orden: i + 1,
      activa: !!idActivo && String(x.escenario_id) === idActivo,
      libroActiva: String(x.activo).toUpperCase() === 'TRUE' || x.activo === true,
      hoja: x.hoja || null, estadoLibro: x.estado || null, escenario: null
    };
  });
}

/* ───────────── entradas de la vía lote ───────────── */
function entradasLote(caso, ctx) {
  const N = ctx.nucleo, m = ctx.motor, ctrls = m.controles;
  let vals = Object.assign({}, m.defaults.vals);
  vals = N.aplica(vals, N.entradasDeRenglon(caso.renglon || {}), ctrls, { modo: 'renglon' });
  const esc = ctx.version && ctx.version.escenario;
  if (esc && esc.inputs) {
    REINICIOS_ESC.forEach(id => N.fija(vals, ctrls, id, 0));
    vals = N.aplica(vals, esc.inputs, ctrls, { modo: 'escenario' });
  }
  return N.relaciones(m.html, vals, ctrls, 'clampRelations');
}

/* ───────────── la traducción (común a las dos vías) ───────────── */
function traduce(N, r, flows, renglon, deLibro) {
  const p = r.p || {}, x = k => N.num(r[k]), pp = k => N.num(p[k]);
  const suma = (a, b) => (x(a) === null || x(b) === null ? null : x(a) + x(b));
  const total = x('totalMonths');
  const v = {
    nombre: null,
    tierra: N.mdp(x('land')),
    ventas: N.mdp(x('sales')),
    costo_sin_tierra: x('projectCost') === null || x('land') === null ? null : N.mdp(x('projectCost') - x('land')),
    costo_dinero: N.mdp(suma('interest', 'feeDebt')),
    ganancia: N.mdp(x('profit')),
    margen: N.r6(x('margin')),
    banco_max: N.mdp(x('peak')),
    banco_mes: x('peakMonth'),
    capital: N.mdp(x('equityUsed')),
    respaldo: N.mdp(x('fundingGap')),
    caja_cierre: N.mdp(x('cash')),
    resultado_repartir: N.mdp(x('distributable')),
    obra_inicio: x('buildStart') === null ? null : x('buildStart') + 1,
    fin_obra: x('buildFinish'),
    mes_saldos: total === null || pp('delivery') === null ? null : Math.max(1, total - pp('delivery') + 1),
    ultimo_cobro: total,
    mes_reparto: total,
    dueno_meses: x('ownerCapital') > 0 ? total : null,
    dueno_aporta: N.mdp(x('ownerCapital')),
    dueno_recibe: N.mdp(x('ownerTotalProceeds')),
    dueno_veces: N.r6(x('ownerMoic')),
    alianza_recibe: N.mdp(x('devGain'))
  };
  const dato = (valor) => ({ valor: valor === undefined ? null : valor, estado: null });
  const datos = {
    'terreno.m2': dato(N.r3(pp('terrain'))),
    'tierra.valor': dato(N.mdp(x('land'))),
    'lamina.m2_construidos': dato(N.r3(x('gross'))),
    'lamina.m2_vendibles': dato(N.r3(x('vendTotal'))),
    'cob.enganche': dato(N.r6(pp('eng'))),
    'din.tasa_capital': dato(N.r6(pp('pref'))),
    'din.apertura': dato(N.r6(pp('feeDebt'))),
    'din.preventa_minima': dato(N.r6(pp('minPreventaObra'))),
    'costo.comision': dato(N.r6(pp('comision')))
  };
  /* Producto. Precio por m² de lista (sin el descuento de preventa, como el deslizante). */
  const productos = N.productos([
    { nombre: 'Deptos A · ' + (pp('m2Loft') ?? '—') + ' m²', unidades: x('mixLoftUnits'), m2: x('m2Loft'), precio_m2: pp('preViv'), ventas: null },
    { nombre: 'Deptos B · ' + (pp('m22Rec') ?? '—') + ' m²', unidades: x('mix2Units'), m2: x('m2Dos'), precio_m2: pp('preViv'), ventas: null },
    { nombre: 'Deptos C · ' + (pp('m23Rec') ?? '—') + ' m²', unidades: x('mix3Units'), m2: x('m2Tres'), precio_m2: pp('preViv'), ventas: null },
    { nombre: 'Locales', unidades: pp('localesPB') > 0 && x('comSell') > 0 ? pp('localesPB') : null, m2: x('comSell'), precio_m2: pp('preCom'), ventas: x('comRev') },
    { nombre: 'Cajones vendibles', unidades: pp('precioCajon') > 0 ? x('spacesVenta') : null, m2: null, precio_m2: null, ventas: pp('precioCajon') > 0 ? x('parkingRev') : null, precio_unidad: pp('precioCajon') > 0 ? pp('precioCajon') : null }
  ]);
  /* Flujo en pesos. */
  /* Una serie que el motor (o el libro) no da no se entrega; dentro de una serie que sí existe, un mes
     vacío es 0 (así lo deja el motor en `flows`). */
  const hay = k => flows.some(f => N.num(f[k]) !== null);
  const serie = k => flows.map(f => (N.num(f[k]) === null ? 0 : N.num(f[k])));
  const MAPA = { cobranza: 'rev', egresos: 'cost', cap_aporta: 'equity', interes: 'pik', apertura: 'fee', saldo_banco: 'debt', respaldo: 'gap', caja: 'caja' };
  if (deLibro) Object.assign(MAPA, { disposicion: 'draw', pago_banco: 'repay', cap_acum: 'equityAcum' });
  const series = {};
  Object.keys(MAPA).forEach(fila => { if (hay(MAPA[fila])) series[fila] = serie(MAPA[fila]); });
  const flujoVisor = flows.length ? N.armaFlujo(series, { mesReparto: total }) : { meses: null, filas: {}, total: {} };
  const reparto = {
    numero: null, esquema: null, tasa_capital: N.r6(pp('pref')), paga_tierra: null,
    parte_dueno: N.r6(x('effectiveOwnerResidual')), parte_alianza: null, parte_capital: null, honorarios_pct: null
  };
  const plan = { nombre: renglon.nombre_caso || renglon.palabra || null, ubicacion: renglon.ubicacion || null, tipo: renglon.tipo || null };
  return { plan, v, datos, productos, flujo: flujoVisor, reparto, candados: [], pruebas: [] };
}
/* El flujo como lo manda `guardar` del tablero, para conciliar contra FLUJO. */
function flujoGuardar(flows) {
  return flows.map(f => [f.m, Math.round(f.rev), Math.round(f.cost), Math.round(f.equity), Math.round((f.pik || 0) + (f.fee || 0)), Math.round(f.debt), Math.round(f.caja)]);
}

/* ───────────── la foto de una versión ───────────── */
function fotoLibro(caso, ctx) {
  const N = ctx.nucleo, ver = ctx.version || {}, libro = caso.libro;
  const hoja = ver.hoja && libro.hojas ? libro.hojas[ver.hoja] : null;
  if (!hoja) throw new Error('El libro no trae la hoja de la versión ' + (ver.hoja || ver.id) + '.');
  const r = resultadosDeLibro(hoja.resultados);
  ['sales', 'projectCost', 'profit', 'totalMonths'].forEach(k => { if (N.num(r[k]) === null) throw new Error('La hoja ' + ver.hoja + ' no trae ' + k + '.'); });
  const flows = flujoDeLibro(hoja.flujo, r.totalMonths);
  revisaLibro(r, flows);
  const visor = traduce(N, r, flows, caso.renglon || {}, true);
  return {
    origen: 'libro',
    motor_commit: ('libro:' + String(libro.modelo || 'sin-modelo') + (libro.revision ? '@' + String(libro.revision).slice(0, 12) : '')).slice(0, 60),
    entradas: { hoja: ver.hoja, modelo: libro.modelo || null, p: r.p },
    cifras: { ventas: N.num(r.sales), costo_proyecto: N.num(r.projectCost), utilidad: N.num(r.profit) },
    flujo: flujoGuardar(flows),
    visor
  };
}
function fotoLote(caso, ctx) {
  const N = ctx.nucleo, m = ctx.motor;
  if (!m) throw new Error('Falta el motor VERTICAL en ctx.motor.');
  const vals = entradasLote(caso, ctx);
  const r = m.computar(vals);
  if (!r || typeof r !== 'object') throw new Error('computar() no regresó resultado.');
  ['sales', 'projectCost', 'profit'].forEach(k => { if (N.num(r[k]) === null) throw new Error('computar() no dio ' + k + '.'); });
  const flows = Array.isArray(r.flows) ? r.flows : [];
  return {
    origen: 'lote',
    entradas: { vals },
    cifras: { ventas: r.sales, costo_proyecto: r.projectCost, utilidad: r.profit },
    flujo: flujoGuardar(flows),
    visor: traduce(N, r, flows, caso.renglon || {}, false)
  };
}
function foto(caso, ctx) {
  const ver = ctx.version || {};
  if (caso && caso.libro && ver.hoja) return fotoLibro(caso, ctx);
  if (caso && caso.libro && Array.isArray(caso.libro.versiones) && caso.libro.versiones.length) throw new Error('Versión de libro sin hoja.');
  return fotoLote(caso, ctx);
}

module.exports = { TIPO, versiones, foto, REINICIOS_ESC, FLUJO_LIBRO, numeroLibro, resultadosDeLibro, flujoDeLibro, entradasLote, traduce };
