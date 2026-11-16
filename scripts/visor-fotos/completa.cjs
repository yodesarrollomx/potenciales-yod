'use strict';
/**
 * Paso «completa» de la foto del visor (PPP 1). Se aplica DESPUÉS del módulo de cada motor y del núcleo:
 * toma el renglón ya armado (forma ppp2-visor-v1) y llena lo que quedó en null, en dos niveles.
 *
 *  1. MAPEA lo que sí existe y no se había llevado: salidas de `computar()` (o del libro nativo) y del renglón.
 *  2. DEDUCE lo que el PPP de siempre no calcula pero sale de cifras que ya da el motor, con fórmulas escritas
 *     en docs/visor-ppp1.md («Lo que se deduce») y la misma definición del libro del PPP 2 (ppp2/libro/generar.py).
 *     Cada valor deducido queda anotado en `visor_json.deducido` (ruta → «de qué sale y cómo»), para que la
 *     leyenda del visor diga «deducido de …». También se anota ahí lo poco que se CORRIGE para que el visor cuadre
 *     (p. ej. «resultado a repartir» = lo que de verdad se reparte, sin contar dos veces el capital).
 *
 * Lo que no se puede deducir sin inventar un supuesto NO se llena: queda en `aseo.sin_llenar` con el supuesto
 * que haría falta (lista de reestructura). Nunca se pone un cero que nadie calculó: un cero sólo entra cuando el
 * propio modelo lo dice (p. ej. «el motor no le paga rendimiento al capital antes de repartir») y va anotado.
 *
 * Además evalúa cada versión con los criterios de Dirección (`criterios`) y aplica una «Propuesta de
 * reestructura» (`reestructura`): una versión NUEVA del caso, corrida con el MISMO motor moviendo sólo entradas,
 * que nunca queda elegida por omisión. Qué entradas mueve lo decide quien la propone (fuera del repo); aquí
 * sólo se calcula, se completa y se comprueba.
 *
 * Es una ampliación de la excepción autorizada al contrato del 30-sep (ARQUITECTURA-SHEETS.md): estas
 * fórmulas viven fuera de Sheets SÓLO para el visor; nada las lee como dato de entrada.
 *
 * Sin red, sin hojas de cálculo, sin POST. Sin dependencias: sólo módulos de Node y el núcleo.
 */
const fs = require('node:fs');
const path = require('node:path');
const N = require('./nucleo.cjs');

const PREFIJO_REESTRUCTURA = 'Propuesta de reestructura';
const ID_REESTRUCTURA = 'reestructura';
const TOPE_CAPITAL = 1 / 3;            // capital ideal: hasta 1/3 de las ventas (pasarse sólo avisa)
const CAJA_MINIMA = 0.05;              // la caja nunca debe bajar de 5 % del costo de obra (criterio de Dirección)
const PESO = 1;                        // tolerancia de un peso por mes en las identidades del flujo

/* Las nueve pruebas de la revisión para fondos: mismas claves, sentido y límites que `revision_formula`
   (ppp2/libro/generar.py) y `PRUEBAS` (visor.js). `guarda` = la fórmula del libro la envuelve en ISNUMBER:
   si el valor no es número (p. ej. «sin banco»), la prueba no cuenta como falla. */
const PRUEBAS = [
  { k: 'rv_linea_ventas', modo: 'max', lim: 0.65, guarda: true },
  { k: 'rv_linea_costo', modo: 'max', lim: 0.5, guarda: true },
  { k: 'rv_aportacion', modo: 'min', lim: 0.2, guarda: false },
  { k: 'rv_preventa', modo: 'min', lim: 0.35, guarda: false },
  { k: 'rv_preventa_banco', modo: 'min', lim: 0.4, guarda: true },
  { k: 'rv_cobertura', modo: 'min', lim: 1.3, guarda: true },
  { k: 'rv_margen', modo: 'min', lim: 0.2, guarda: false },
  { k: 'rv_meses_credito', modo: 'max', lim: 36, guarda: true },
  { k: 'rv_falta', modo: 'cero', lim: 0.01, guarda: false }
];
/* Los cinco esquemas de reparto del libro del PPP 2 (ESQUEMAS_DEFECTO): paga tierra, dueño, alianza, capital. */
const ESQUEMAS_PPP2 = [
  { n: 1, paga: true, d: 0, a: 1, c: 0 },
  { n: 2, paga: true, d: 0.5, a: 0.5, c: 0 },
  { n: 3, paga: false, d: 0.5, a: 0.5, c: 0 },
  { n: 4, paga: true, d: 0.3, a: 0.2, c: 0.5 },
  { n: 5, paga: true, d: 0.4, a: 0.4, c: 0.2 }
];

/* ───────────── utilidades ───────────── */
const num = N.num;
const fin = x => typeof x === 'number' && Number.isFinite(x);
const suma = a => (a || []).reduce((s, x) => s + (fin(x) ? x : 0), 0);
const ceros = n => Array(n).fill(0);
const acum = a => { let s = 0; return a.map(x => (s += x)); };
const ant = (a, i) => (i > 0 ? a[i - 1] : 0);
const cerca = (a, b, tol) => fin(a) && fin(b) && Math.abs(a - b) <= Math.max(tol || 1000, 1e-6 * Math.abs(b));
/* El mes (base 1) en que se liquida un saldo: el último mes con saldo, más uno (regla LIQ del libro). */
function liquida(saldo) { let u = 0; saldo.forEach((x, i) => { if (x > PESO) u = i + 1; }); return u ? u + 1 : null; }
function primero(a) { for (let i = 0; i < a.length; i++) if (a[i] > 1e-9) return i; return -1; }

/* ───────────── el resultado del motor para una versión (para leer lo que el módulo no llevó) ───────────── */
/* Columnas del bloque mensual del libro vertical → nombres de trabajo. */
const COL_LIBRO = { m: 'Mes', rev: 'Cobros', cost: 'Costo', equity: 'Equity', pik: 'Interés', capPik: 'PIK capital', fee: 'Comisión deuda',
  draw: 'Desembolso', repay: 'Pago deuda', gap: 'Brecha nueva', cure: 'Cura brecha', debt: 'Deuda final', caja: 'Caja final', capAcum: 'Equity acumulado' };
function flujoLibro(mod, flujo, meses) {
  const f = flujo || {};
  const enc = Array.isArray(f.encabezado) && f.encabezado.some(x => String(x || '').trim()) ? f.encabezado.map(x => String(x || '').trim()) : mod.FLUJO_LIBRO;
  const idx = {};
  Object.keys(COL_LIBRO).forEach(k => { idx[k] = enc.indexOf(COL_LIBRO[k]); });
  const filas = (f.filas || []).filter(x => Array.isArray(x) && mod.numeroLibro(x[idx.m]) !== null).slice(0, Number(meses) || undefined);
  return filas.map(x => { const o = {}; Object.keys(idx).forEach(k => { o[k] = idx[k] < 0 ? null : (mod.numeroLibro(x[idx[k]]) ?? 0); }); return o; });
}
/* Corre otra vez la versión con las MISMAS entradas que usó el módulo (la huella lo comprueba después). */
function resultado(tipo, mod, caso, version, motor) {
  const ctx = { nucleo: N, motor, version };
  if (tipo === 'VERTICAL' && caso.libro && version.hoja) {
    const hoja = caso.libro.hojas && caso.libro.hojas[version.hoja];
    if (!hoja) throw new Error('El libro no trae la hoja ' + version.hoja + '.');
    const r = mod.resultadosDeLibro(hoja.resultados);
    return { r, flows: flujoLibro(mod, hoja.flujo, r.totalMonths), libro: true, entradas: { hoja: version.hoja, modelo: caso.libro.modelo || null, p: r.p } };
  }
  if (!motor) throw new Error('Falta el motor ' + tipo + '.');
  if (tipo === 'VERTICAL') { const vals = mod.entradasLote(caso, ctx); const r = motor.computar(vals); return { r, flows: r.flows, entradas: { vals } }; }
  if (tipo === 'MACROLOTES' || tipo === 'UNIFAMILIAR') { const vals = mod.entradas(caso, ctx); const r = motor.computar(vals); return { r, flows: r.flows, entradas: { vals } }; }
  if (tipo === 'RESIDENCIAL') { const e = mod.entradas(caso, ctx); const r = motor.computar(e.vals, e.viv); return { r, flows: r.flows, entradas: e }; }
  throw new Error('Tipo sin paso de completar: ' + tipo);
}

/* ───────────── el flujo, con las identidades del motor ───────────── */
/* Series mensuales en pesos. Lo que el motor no entrega por mes sale de sus propias identidades:
     deuda:  Δdeuda = interés capitalizado + desembolso + comisión − pago        (el desembolso y el pago no
             caen en el mismo mes: el motor primero pide y luego paga sólo si sobra)
     caja:   Δcaja − Δdeuda = cobranza − costo − interés − comisión + capital + respaldo − cura del respaldo
     interés capitalizado = min(interés del mes, tope de deuda − deuda del mes anterior)  (regla del motor) */
function normaliza(tipo, r, flows, libro) {
  const fl = flows || [], T = fl.length, g = k => fl.map(f => num(f[k]) ?? 0), hay = k => fl.length && fl[0] && fl[0][k] !== undefined && fl[0][k] !== null;
  const F = { T, rev: g('rev'), cost: g('cost'), equity: g('equity'), caja: g('caja'), notas: [] };
  if (tipo === 'UNIFAMILIAR') {
    F.pik = g('ret'); F.fee = ceros(T); F.debt = ceros(T); F.capPik = ceros(T); F.draw = ceros(T); F.repay = ceros(T);
    F.gap = ceros(T); F.cure = ceros(T); F.ajeno = g('saldo'); F.banco = false;
  } else {
    F.pik = g('pik'); F.fee = g('fee'); F.debt = g('debt'); F.ajeno = ceros(T);
    const tope = num(r.debtCap);
    F.capPik = libro && hay('capPik') ? g('capPik') : hay('capitalizedPik') ? g('capitalizedPik')
      : F.pik.map((x, i) => Math.min(x, Math.max(0, (tope === null ? Infinity : tope) - ant(F.debt, i))));
    const neto = F.debt.map((d, i) => d - ant(F.debt, i) - F.capPik[i] - F.fee[i]);
    F.draw = neto.map(x => (x > 0 ? x : 0)); F.repay = neto.map(x => (x < 0 ? -x : 0));
    if (hay('gap')) { F.gap = g('gap'); F.cure = hay('gapCure') ? g('gapCure') : g('cure'); }
    else {
      const resto = F.caja.map((c, i) => (c - ant(F.caja, i)) - (F.debt[i] - ant(F.debt, i)) - (F.rev[i] - F.cost[i] - F.pik[i] - F.fee[i] + F.equity[i]));
      F.gap = resto.map(x => (x > PESO ? x : 0)); F.cure = resto.map(x => (x < -PESO ? -x : 0));
    }
    F.banco = true;
    /* Que lo deducido cuadre con los totales del propio motor; si no, no se entrega. */
    if (num(r.debtDraws) !== null && !cerca(suma(F.draw), r.debtDraws, Math.max(1000, T))) F.notas.push('desembolsos ≠ debtDraws del motor');
    if (num(r.fundingGap) !== null && !cerca(suma(F.gap) - suma(F.cure), r.fundingGap, Math.max(1000, T))) F.notas.push('respaldo ≠ fundingGap del motor');
  }
  F.capAcum = libro && hay('capAcum') ? g('capAcum') : acum(F.equity);
  F.gapOut = acum(F.gap.map((x, i) => x - F.cure[i]));
  /* Flujo acumulado (libro del PPP 2, «Flujo acumulado antes de pagar la tierra»): lo que tiene el proyecto
     menos lo que debe a quien lo fondeó (capital aportado, banco, respaldo y, en la casa, el inversionista). */
  F.flujoAcum = F.caja.map((c, i) => c - F.capAcum[i] - F.debt[i] - F.gapOut[i] - F.ajeno[i]);
  F.ajenoUso = F.debt.map((d, i) => d + F.capAcum[i] + F.gapOut[i] + F.ajeno[i]);
  F.ok = !F.notas.length;
  return F;
}

/* ───────────── calendario de firmas (unidades y valor firmado por mes) ───────────── */
/* Vertical: la preventa se firma pareja en los meses de preventa y lo demás (deptos sin preventa, locales y
   cajones) al entregar; es exactamente como el motor arma sus cobros. Se comprueba contra los cobros del motor:
   enganche + pagos durante la obra + saldos = cobranza, mes por mes; si no cuadra, no se entrega. */
function calendarioVertical(r, F, unidadesProductos) {
  const p = r.p || {}, T = F.T, pm = Math.round(num(p.preMonths) || 0), del = Math.round(num(p.delivery) || 0);
  if (!(pm > 0) || !(del > 0) || !T) return null;
  const pre = num(r.presaleRev), post = num(r.postRev) || 0, com = num(r.comRev) || 0, park = num(r.parkingRev) || 0;
  if (pre === null || num(p.eng) === null || num(p.obra) === null) return null;
  const sign = pre * p.eng, durante = pre * p.obra, final = pre - sign - durante;
  const firmas = ceros(T), deptos = ceros(T), firmado = ceros(T), eng = ceros(T), sal = ceros(T);
  const uPre = num(r.presaleUnits) || 0, uTot = unidadesProductos > 0 ? unidadesProductos : (num(r.units) || 0);
  for (let i = 0; i < Math.min(pm, T); i++) { eng[i] += sign / pm; firmas[i] += uPre / pm; deptos[i] += uPre / pm; firmado[i] += pre / pm; }
  for (let i = Math.max(0, T - del); i < T; i++) {
    sal[i] += (final + post + com + park) / del; firmas[i] += (uTot - uPre) / del; deptos[i] += ((num(r.units) || 0) - uPre) / del; firmado[i] += (post + com + park) / del;
  }
  const pagos = F.rev.map((x, i) => x - eng[i] - sal[i]);
  const bs = num(r.buildStart), bf = num(r.buildFinish);
  const fuera = pagos.some((x, i) => x < -PESO || ((bs !== null && i < bs) || (bf !== null && i >= bf) ? Math.abs(x) > PESO : false));
  if (!fuera && cerca(suma(pagos), durante, Math.max(1000, T))) {
    return { firmas, deptos, firmado, total: num(r.units), enganches: eng, saldos: sal, pagos_obra: pagos.map(x => (Math.abs(x) <= PESO ? 0 : x)) };
  }
  /* Un libro que escalona la preventa y la entrega distinto que el tablero (p. ej. por edificio). Si no hay pagos
     durante la obra, antes de la entrega sólo entran enganches, y el motor cobra el enganche al firmar: lo cobrado
     en esos meses ÷ % de enganche es lo firmado, y ÷ precio promedio de la preventa son unidades. Se comprueba que
     esos meses sumen exactamente el enganche de toda la preventa y que salgan las unidades de preventa. En qué mes
     se firma lo que se vende al entregar no se sabe: no se entregan firmas completas, sólo lo que depende de la
     preventa (lo firmado antes del primer desembolso y la cobertura antes de la entrega). */
  if (Math.abs(durante) > PESO || !(p.eng > 0) || !(uPre > 0)) return null;
  let acc = 0, corte = -1;
  for (let i = 0; i < T; i++) { acc += F.rev[i]; if (acc >= sign - Math.max(1000, T)) { corte = i + 1; break; } }
  if (corte < 0 || !cerca(acc, sign, Math.max(1000, T))) return null;
  const precioU = pre / uPre, engL = ceros(T), salL = ceros(T), depL = ceros(T), preF = ceros(T);
  for (let i = 0; i < T; i++) {
    if (i < corte) { engL[i] = F.rev[i]; preF[i] = F.rev[i] / p.eng; depL[i] = preF[i] / precioU; } else salL[i] = F.rev[i];
  }
  if (!cerca(suma(depL), uPre, 0.01) || !cerca(suma(salL), final + post + com + park, Math.max(1000, T))) return null;
  return { parcial: true, firmas: null, deptos: depL, firmado: null, preFirmado: preF, s0: primero(salL), total: num(r.units), enganches: engL, saldos: salL, pagos_obra: ceros(T) };
}
/* Macrolotes: cada segmento vende `abs` unidades al mes desde el inicio de ventas (venta: enganche al firmar y
   saldo al entregar la nave o en mensualidades del lote; renta: se colocan unidades y no queda nada por cobrar
   de un contrato de venta). Es la misma regla de `ventaSerie`/`rentaSerie` del motor; se comprueba que lo
   firmado sume los ingresos de venta del motor y que lo cobrado cuadre con su cobranza. */
function calendarioMacro(r, F) {
  const p = r.p || {}, T = F.T;
  if (!T || num(p.inicioVentas) === null) return null;
  const fP = 1 + (num(p.varPrecios) || 0), firmas = ceros(T), firmado = ceros(T), cobrado = ceros(T), saldoCob = ceros(T);
  let renta = false;
  const venta = (n, abs, precioU, eng, saldoMeses, esNave) => {
    let v = 0;
    for (let m = p.inicioVentas - 1; m < T && v < n; m++) {
      const u = Math.min(abs, n - v); v += u; firmas[m] += u;
      const tot = u * precioU; firmado[m] += tot; cobrado[m] += tot * eng;
      if (esNave) { const e = Math.min(m + p.mesesEntregaNave, T - 1); cobrado[e] += tot * (1 - eng); saldoCob[e] += tot * (1 - eng); }
      else for (let k = 1; k <= saldoMeses; k++) { const mm = Math.min(m + k, T - 1); cobrado[mm] += tot * (1 - eng) / saldoMeses; saldoCob[mm] += tot * (1 - eng) / saldoMeses; }
    }
  };
  const coloca = (n, abs) => { renta = true; let c = 0; for (let m = p.inicioVentas - 1; m < T && c < n; m++) { const u = Math.min(abs, n - c); c += u; firmas[m] += u; } };
  if (r.rentaN) coloca(r.nNaves || 0, p.absNaves);
  else if (r.loteNaves) venta(r.nNavesLote || 0, p.absNaves, r.supLoteNave * p.preNaveLote * fP, p.engLote, p.mesesSaldoLote, false);
  else venta(r.nNaves || 0, p.absNaves, p.m2Nave * p.preNave * fP, p.engNave, 0, true);
  venta(r.nMacro || 0, p.absMacro, p.m2Macro * p.preMacro * fP, p.engLote, p.mesesSaldoLote, false);
  if (r.rentaC) coloca(r.nCom || 0, p.absCom); else venta(r.nCom || 0, p.absCom, p.m2LoteCom * p.preCom * fP, p.engLote, p.mesesSaldoLote, false);
  if (r.brena) venta(r.uViv || 0, p.absMacro, (r.ingViv || 0) / Math.max(1, r.uViv || 0), p.engLote, p.mesesSaldoLote, false);
  else venta(r.nViv || 0, p.absViv, p.m2LoteViv * p.preVivLote * fP, p.engLote, p.mesesSaldoLote, false);
  const ingVenta = (r.rentaN ? 0 : (r.ingNaves || 0)) + (r.ingMacro || 0) + (r.rentaC ? 0 : (r.ingCom || 0)) + (r.ingViv || 0);
  if (!cerca(suma(firmado), ingVenta, Math.max(1000, T))) return null;
  if (renta ? cobrado.some((x, i) => x > F.rev[i] + PESO) : cobrado.some((x, i) => Math.abs(x - F.rev[i]) > PESO)) return null;
  /* Sin renta, lo cobrado es exactamente la cobranza del motor: se parte en el enganche de cada venta y lo que se cobra
     después (saldo al entregar la nave o mensualidades del lote). Con renta no: la renta no es un contrato de venta. */
  return { firmas, firmado, cobrado, saldoCob, enganches: renta ? null : cobrado.map((x, i) => x - saldoCob[i]), saldos: renta ? null : saldoCob.slice() };
}
/* Residencial: `absLotes` lotes al mes desde el inicio de ventas hasta venderlos todos (el bucle de ventas del motor). */
function calendarioResidencial(r, F) {
  const p = r.p || {}, T = F.T, n = num(r.nLotes) || 0;
  if (!T || !(p.absLotes > 0) || num(p.inicioVentas) === null) return null;
  const firmas = ceros(T);
  let v = 0;
  for (let m = p.inicioVentas - 1; m < T && v < n; m++) { const u = Math.min(p.absLotes, n - v); v += u; firmas[m] += u; }
  return { firmas, firmado: null };
}
/* Casa: una unidad que se firma y se escritura en el mes de la venta (el motor cobra toda la venta en ese mes). */
function calendarioUnifamiliar(r, F) {
  const T = F.T;
  if (!T) return null;
  const firmas = ceros(T), saldos = ceros(T), i = T - 1;
  firmas[i] = 1; saldos[i] = F.rev[i];
  return { firmas, firmado: F.rev.slice(), saldos, enganches: ceros(T), pagos_obra: ceros(T) };
}

/* ───────────── los hechos de cada motor (en pesos), con nombres comunes ───────────── */
function hechos(tipo, r, F, visor) {
  const p = r.p || {}, x = k => num(r[k]), H = { tipo, T: F.T };
  const uProd = suma((visor.productos || []).map(q => q.unidades));
  if (tipo === 'VERTICAL') {
    Object.assign(H, {
      ventas: x('sales'), costoConTierra: x('projectCost'), tierraValor: x('land'), tierraAportada: x('ownerCapital'), tierraEfectivo: x('landCash'),
      capital: x('equityUsed'), linea: x('debtCap'), respaldo: x('fundingGap'), dueno: x('ownerTotalProceeds'), alianza: x('devGain'), inversion: 0,
      preventaArranque: x('preventaAtBuild'), pagosObra: x('presaleRev') !== null && num(p.obra) !== null ? x('presaleRev') * p.obra : null,
      costos: { obra: x('hard'), indirectos: x('indirect') === null ? null : x('indirect') + (x('legal') || 0), imprevistos: x('cont'), comisiones: x('commission'), cierre: x('closing') },
      reconcilia: x('cashReconciliation'), cobranzaTotal: x('revTotal'),
      reparto: {
        /* El preferente es una tasa anual (el motor la cobra por meses ÷ 12). Sin «Cascada:» cabe en los 80 del servidor. */
        esquema: 'Regresan tierra y capital; preferente ' + N.r3((num(p.pref) || 0) * 100) + ' % anual; residual ' + N.r3((x('effectiveOwnerResidual') || 0) * 100) + ' % al dueño',
        tasa: num(p.pref), paga: (x('ownerCapital') || 0) > 0 || (x('landCash') || 0) > 0, dueno: x('effectiveOwnerResidual'), honorarios: 0
      },
      cal: calendarioVertical(r, F, uProd)
    });
  } else if (tipo === 'MACROLOTES') {
    const valor = x('superficie') !== null && num(p.valorTierraM2) !== null ? x('superficie') * p.valorTierraM2 : null;
    const aportada = valor === null || num(p.aporteTierra) === null ? null : valor * p.aporteTierra;
    const modo1 = Number(p.modoReparto) === 1, imp = num(p.imprevistos), dir = x('directo'), ing = x('ingresos');
    Object.assign(H, {
      ventas: ing, costoConTierra: x('costoProyecto') === null || aportada === null ? null : x('costoProyecto') + aportada, tierraValor: valor, tierraAportada: aportada,
      tierraEfectivo: x('tierraPago'), capital: x('equityUsed'), linea: x('debtCap'), respaldo: x('fundingGap'), dueno: x('ownerTotal'),
      alianza: x('devDist') === null || x('equityUsed') === null ? null : x('devDist') - x('equityUsed'), inversion: 0,
      /* El motor no tiene cierre de tierra. La regalía del dueño (modo 1) no es un costo de la tierra en el
         sentido del visor (ahí la tierra va a su valor): es parte de lo que recibe el dueño, en el reparto. */
      costos: dir === null || ing === null ? null : {
        obra: dir, imprevistos: dir * (imp || 0),
        indirectos: dir * ((num(p.estudios) || 0) + (num(p.licencias) || 0) + (num(p.supervision) || 0)) + ing * ((num(p.legalPct) || 0) + (num(p.adminPct) || 0)),
        comisiones: ing * ((num(p.comisionPct) || 0) + (num(p.mktPct) || 0)), cierre: 0
      },
      regalia: modo1 ? x('regaliaVenta') : null, reconcilia: x('cashReconciliation'), cobranzaTotal: x('revTotal'),
      reparto: { tasa: 0, paga: (x('tierraPago') || 0) > 0, dueno: modo1 ? 0 : num(p.pctDueno), honorarios: 0, modo1 },
      cal: calendarioMacro(r, F)
    });
    H.sentido = sentidoVisor(tipo, r, H);
  } else if (tipo === 'RESIDENCIAL') {
    const urb = x('urbanizacion');
    Object.assign(H, {
      ventas: x('ingresos'), costoConTierra: x('costoProyecto') === null ? null : x('costoProyecto') + (x('tierraAportada') || 0),
      tierraValor: (x('tierraPago') || 0) + (x('tierraAportada') || 0), tierraAportada: x('tierraAportada'), tierraEfectivo: x('tierraPago'),
      capital: x('equityUsed'), linea: x('debtCap'), respaldo: x('fundingGap'), dueno: x('ownerTotal'),
      alianza: x('devDist') === null || x('equityUsed') === null ? null : x('devDist') - x('equityUsed'), inversion: 0,
      costos: urb === null ? null : {
        obra: urb + (x('costoConstrViv') || 0) + (x('ccCosto') || 0), imprevistos: urb * (num(p.imprevistos) || 0),
        indirectos: urb * (num(p.tramites) || 0) + (x('costoDonacion') || 0) + (x('costoOtros') || 0), comisiones: x('blandosIng'), cierre: 0
      },
      cobranzaTotal: x('revTotal'), m2Construidos: r.vivActiva ? (x('nLotesViv') || 0) * (x('m2ConstrPromedioViv') || 0) : 0, otrosIngresos: x('retFinTodo'),
      reparto: { tasa: 0, honorarios: num(p.honorario), dueno: num(p.pctDueno) },
      cal: calendarioResidencial(r, F)
    });
    H.sentido = sentidoVisor(tipo, r, H);
  } else if (tipo === 'UNIFAMILIAR') {
    const cajaFin = F.T ? F.caja[F.T - 1] : null;
    Object.assign(H, {
      ventas: x('venta'), costoConTierra: x('costoTotal') === null ? null : x('costoTotal') - (x('costoFin') || 0), tierraValor: x('costoTerreno'), tierraAportada: 0,
      tierraEfectivo: x('costoTerreno'), capital: x('equityUsed'), linea: 0, respaldo: 0, dueno: x('costoTerreno'),
      alianza: cajaFin === null || x('equityUsed') === null ? null : cajaFin - x('equityUsed'), inversion: x('retAcum'), cobranzaTotal: x('revTotal'),
      reparto: { esquema: 'Tierra comprada; el inversionista cobra su rendimiento; utilidad para el capital', tasa: 0, paga: true, dueno: 0, honorarios: 0 },
      obraInicio: 2, finObra: (num(p.mesesObra) || 0) + 1, cal: calendarioUnifamiliar(r, F)
    });
  }
  H.unidades = uProd;
  return H;
}

/* ───────────── tierra y ganancia con el sentido del visor (macrolotes y residencial) ───────────── */
/* En el visor (libro del PPP 2) `v.tierra` es el valor de la tierra del caso, se pague o se aporte, y
   `v.ganancia` la ganancia real: después de la tierra a su valor, antes de impuestos (`v.margen` = ganancia ÷
   ventas). Los módulos de macrolotes y residencial traían el sentido del PPP de siempre: la tierra pagada en
   efectivo y la utilidad del motor, que es ANTES de la tierra que aporta el dueño. Aquí sólo se mapea:
     · tierra: superficie × valor del m² que trae el motor (la misma cuenta con que el motor arma su tierra en
       efectivo y el «×» del dueño); en residencial con aportación es su `tierraAportada`.
     · ganancia: la salida del motor que ya tiene ese sentido, si la hay: su utilidad cuando toda la tierra es
       costo a su valor (se compra en efectivo y no hay regalía), o en residencial su utilidad repartible cuando
       repaga al dueño su tierra completa (100 %), sin honorario, sin modo histórico y sin quedarse corta. Si no
       la hay, se deduce como el libro: caja al cierre, ya devueltos capital, banco y respaldo (el resultado a
       repartir de la foto), menos la tierra que aporta el dueño a su valor (`gananciaDeR`; la que se paga en
       efectivo ya va en los egresos). Cuando el motor sí da la ganancia, es esa misma cuenta: el mismo plan con la
       tierra pagada o aportada da la misma ganancia. Es antes de repartir: no depende de cómo cobra el dueño (un %
       de la utilidad, una regalía por venta, el repago de su tierra) ni del honorario de la alianza, que salen de
       ella. Sólo si falta el resultado a repartir queda vacía con su razón. `margen` = ganancia ÷ ventas.
   Devuelve {tierra?, tierraTexto?, ganancia? (null = vacía), gananciaTexto?, gananciaDeR?, margen? (null = vacío),
   porque}; lo que no viene no cambia. */
function sentidoVisor(tipo, r, H) {
  const p = r.p || {}, x = k => num(r[k]), out = { porque: {} };
  const pago = x('tierraPago') || 0, aport = H.tierraAportada || 0, valor = H.tierraValor;
  if (!(aport > PESO) && !(tipo === 'MACROLOTES' && (H.regalia || 0) > PESO)) return out;   // toda la tierra es costo a su valor: ya tiene el sentido del visor
  if (aport > PESO && fin(valor)) {
    out.tierra = valor;
    out.tierraTexto = (tipo === 'RESIDENCIAL' && pago <= PESO ? 'valor de la tierra del caso: la tierra que aporta el dueño, según el motor (superficie × valor del m²)' : 'valor de la tierra del caso: superficie × valor del m² que trae el motor')
      + (pago > PESO ? '; ' + N.r3(pago / valor * 100) + ' % se paga en efectivo en el mes 1 (va en egresos) y el resto lo aporta el dueño' : '; el dueño la aporta, no se paga en efectivo');
  }
  const SIN = ' No se calcula aquí: mejor vacía que con otro sentido.';
  if (tipo === 'RESIDENCIAL') {
    const completo = !p.interesesSoloDev && Math.abs((num(p.repagoPct) ?? 0) - 1) < 1e-9 && (x('honorarioDev') || 0) <= PESO;
    const alcanza = fin(x('repagoTierra')) && fin(x('repagoObjetivo')) && x('repagoTierra') >= x('repagoObjetivo') - PESO;
    if (completo && alcanza && fin(x('utilidadRepartible'))) {
      out.ganancia = x('utilidadRepartible');
      out.gananciaTexto = 'utilidad repartible del motor: ya le repagó al dueño su tierra a su valor (100 %) y no hay honorario de desarrollo; es la ganancia después de la tierra';
      /* el margen del motor es el de su utilidad antes de la tierra aportada: el del visor es esta ganancia entre ventas */
      out.margenDeduce = true;
      return out;
    }
    out.ganancia = null;
    out.gananciaDeR = true;
    out.porque['v.ganancia'] = completo
      ? 'La utilidad del motor no alcanza a repagar al dueño su tierra a su valor: el motor deja la utilidad repartible en cero y no da la ganancia después de la tierra (sería negativa).' + SIN
      : 'Con honorario de desarrollo, modo histórico o repago parcial de la tierra, la utilidad repartible del motor no es la ganancia después de la tierra a su valor, y el motor no la da de otro modo.' + SIN;
  } else {
    out.ganancia = null;
    out.gananciaDeR = true;
    out.porque['v.ganancia'] = (H.regalia || 0) > PESO
      ? 'El motor resta la regalía del dueño (un % de cada venta), no la tierra a su valor: no da la ganancia después de la tierra a su valor.' + SIN
      : 'La utilidad del motor es antes de la tierra que aporta el dueño (él cobra un % de esa utilidad): el motor no da la ganancia después de la tierra a su valor.' + SIN;
  }
  out.margen = null;
  out.porque['v.margen'] = 'Es la ganancia del visor entre ventas; el margen del motor es el de su utilidad (otro sentido) y no da otro.' + SIN;
  return out;
}

/* ───────────── la revisión para fondos ───────────── */
/* rv_resultado con la misma regla del libro. Un texto (p. ej. «sin banco») en una prueba con ISNUMBER no falla;
   un null (no se pudo deducir) no se cuenta como aprobado: se dice cuántas quedaron sin dato. */
function revision(v) {
  /* En el libro, «Falta calcular» es «la versión no tiene cifras». Una ganancia vacía a propósito (sin el sentido
     del visor, ver sentidoVisor) no es eso: si hay resultado a repartir, la versión sí calculó. */
  if (!fin(v.ganancia) && !fin(v.resultado_repartir)) return 'Falta calcular';
  let fallas = 0, sinDato = 0;
  PRUEBAS.forEach(p => {
    const x = v[p.k];
    if (!fin(x)) { if (!(p.guarda && typeof x === 'string' && x)) sinDato++; return; }
    const ok = p.modo === 'max' ? x <= p.lim : p.modo === 'min' ? x >= p.lim : x < p.lim;
    if (!ok) fallas++;
  });
  if (sinDato) return fallas ? 'No pasa: ' + fallas + ' de 9 pruebas (' + sinDato + ' sin dato)' : 'Sin dato en ' + sinDato + ' de 9 pruebas';
  if (!fallas) return v.rv_aportacion < 0.25 ? 'Pasa (aportación justa)' : 'Pasa';
  return 'No pasa: ' + fallas + ' de 9 pruebas';
}

/* ───────────── llenar ───────────── */
function llena(visor, H, F, extra) {
  const marca = {}, sinLlenar = {}, mapeados = [], corregidos = {};
  const v = visor.v, d = visor.datos, e = extra || {};
  const deduce = (ruta, valor, texto) => { if (valor === null || valor === undefined || (typeof valor === 'number' && !Number.isFinite(valor))) return false; poner(ruta, valor); marca[ruta] = texto; return true; };
  const mapea = (ruta, valor, de) => { if (valor === null || valor === undefined || (typeof valor === 'number' && !Number.isFinite(valor))) return false; poner(ruta, valor); mapeados.push(ruta + ' ← ' + de); return true; };
  const corrige = (ruta, valor, texto) => { const antes = leer(ruta); if (valor === null || valor === undefined || antes === valor) return; poner(ruta, valor); marca[ruta] = 'corregido: ' + texto; corregidos[ruta] = { antes, despues: valor }; };
  const noAp = (extra && extra.noAp) || {};
  const falta = (ruta, supuesto) => { if ((leer(ruta) === null || leer(ruta) === undefined) && !noAp[ruta]) sinLlenar[ruta] = supuesto; };
  const noAplica = (ruta, razon) => { if (leer(ruta) === null || leer(ruta) === undefined) noAp[ruta] = razon; };
  function leer(ruta) { const [a, b] = ruta.split(/\.(.+)/); if (a === 'v') return v[b]; if (a === 'datos') return d[b] ? d[b].valor : undefined; if (a === 'reparto') return visor.reparto ? visor.reparto[b] : undefined; if (a === 'plan') return visor.plan[b]; return undefined; }
  function poner(ruta, valor) { const [a, b] = ruta.split(/\.(.+)/); if (a === 'v') v[b] = valor; else if (a === 'datos') d[b] = { valor, estado: d[b] ? d[b].estado : null }; else if (a === 'reparto') visor.reparto[b] = valor; else if (a === 'plan') visor.plan[b] = valor; }
  const vacio = ruta => { const x = leer(ruta); return x === null || x === undefined; };
  const M = N.mdp, T = F.T, ult = T ? T - 1 : 0, sinBanco = !(H.linea > 0);

  /* 0 · tierra y ganancia con el sentido del visor (macrolotes y residencial; ver sentidoVisor). Lo que se deja
     vacío lleva su razón en `sin_llenar` y en `vacios` (que va a la columna `conciliacion`). Va primero: la
     revisión y lo demás leen ya estas claves. */
  const vacios = {};
  const anula = (ruta, porque) => { const antes = leer(ruta); if (antes !== null && antes !== undefined) { poner(ruta, null); corregidos[ruta] = { antes, despues: null }; } sinLlenar[ruta] = porque; vacios[ruta] = porque; };
  const S = H.sentido;
  if (S) {
    if (fin(S.tierra)) {
      corrige('v.tierra', M(S.tierra), S.tierraTexto);
      if (H.tipo === 'MACROLOTES') corrige('datos.tierra.valor', M(S.tierra), S.tierraTexto);
    }
    /* con `gananciaDeR` la ganancia y su margen se deducen abajo, cuando ya está el resultado a repartir */
    if (S.ganancia === null && !S.gananciaDeR) anula('v.ganancia', S.porque['v.ganancia']);
    else if (fin(S.ganancia)) corrige('v.ganancia', M(S.ganancia), S.gananciaTexto);
    if (S.margen === null && !S.gananciaDeR) anula('v.margen', S.porque['v.margen']);
    if (S.margenDeduce && fin(v.ganancia) && fin(v.ventas) && v.ventas > 0) corrige('v.margen', N.r6(v.ganancia / v.ventas), 'ganancia real ÷ ventas, como el libro (el margen del motor es el de su utilidad antes de la tierra que aporta el dueño)');
  }

  /* 0 · encabezado y texto */
  if (vacio('v.huella')) mapea('v.huella', e.huella || null, 'huella_entradas del renglón');
  if (vacio('v.que_cambia') && e.queCambia) deduce('v.que_cambia', e.queCambia, 'deducido de las entradas de esta versión contra la anterior');
  if (vacio('plan.tipo')) deduce('plan.tipo', { VERTICAL: 'Vertical mixto', MACROLOTES: 'Macrolotes', RESIDENCIAL: 'Lotes residenciales', UNIFAMILIAR: 'Unifamiliar' }[H.tipo], 'el tipo del motor del PPP de siempre');

  /* 3 · tiempo */
  if (vacio('v.obra_inicio') && fin(H.obraInicio)) deduce('v.obra_inicio', H.obraInicio, 'calendario del motor: la obra va del mes 2 al último mes de obra');
  if (vacio('v.fin_obra') && fin(H.finObra)) deduce('v.fin_obra', H.finObra, 'calendario del motor: meses de obra + 1');
  if (vacio('v.mes_reparto') && T) deduce('v.mes_reparto', T, 'último mes del flujo del motor (ahí se cobra y se reparte)');
  if (vacio('v.ultimo_cobro')) { let u = 0; F.rev.forEach((x, i) => { if (Math.abs(x) > PESO) u = i + 1; }); if (u) deduce('v.ultimo_cobro', u, 'último mes con cobranza en el flujo del motor'); }
  const mesSaldos = e.mesSaldos;
  if (vacio('v.mes_saldos') && fin(mesSaldos)) deduce('v.mes_saldos', mesSaldos, e.mesSaldosTexto || 'primer mes en que entra un pago que no es enganche');

  /* 4 · costo y ganancia: el desglose (totales, sin serie mensual) */
  /* (se pone en flujo.total al armar el flujo) */

  /* 5 · dinero */
  if (vacio('v.capital')) mapea('v.capital', M(H.capital), 'equityUsed del motor');
  if (vacio('v.banco_max') && H.tipo === 'UNIFAMILIAR') deduce('v.banco_max', 0, 'la casa no usa banco: el saldo máximo del banco es 0 (como lo da el libro sin banco)');
  if (vacio('v.respaldo') && H.tipo === 'UNIFAMILIAR') deduce('v.respaldo', 0, 'nunca falta dinero: el capital cubre cada mes que la caja quedaría negativa');
  if (vacio('v.max_ajeno') && T) deduce('v.max_ajeno', M(Math.max(...F.ajenoUso)), 'máximo mensual de saldo del banco + capital aportado + respaldo pendiente');
  /* en la casa, el dinero ajeno es el capital aportado más lo que se le debe al inversionista (el módulo sólo contaba lo del inversionista) */
  else if (H.tipo === 'UNIFAMILIAR' && T) corrige('v.max_ajeno', M(Math.max(...F.ajenoUso)), 'máximo mensual del capital aportado más lo que se le debe al inversionista (antes contaba sólo al inversionista)');
  const R = T ? F.flujoAcum[ult] : null;
  if (fin(R)) {
    if (vacio('v.resultado_repartir')) deduce('v.resultado_repartir', M(R), 'caja al cierre menos el capital aportado, la deuda y el respaldo que siguen pendientes');
    else corrige('v.resultado_repartir', M(R), 'caja al cierre menos el capital aportado (antes contaba el capital adentro o ya restaba la tierra)');
  }
  /* la ganancia después de la tierra a su valor, como el libro (ganancia = caja al cierre − tierra): el resultado a
     repartir menos la tierra que aporta el dueño (la que se paga en efectivo ya está en los egresos) */
  if (S && S.gananciaDeR) {
    if (fin(R) && fin(H.tierraAportada)) {
      const textoG = 'resultado a repartir (caja al cierre, ya devueltos capital, banco y respaldo) menos la tierra que aporta el dueño a su valor: la ganancia después de la tierra, como en el libro; el motor no la da así';
      if (vacio('v.ganancia')) deduce('v.ganancia', M(R - H.tierraAportada), textoG); else corrige('v.ganancia', M(R - H.tierraAportada), textoG);
      if (fin(v.ventas) && v.ventas > 0) {
        const textoM = 'ganancia ÷ ventas, como el libro';
        if (vacio('v.margen')) deduce('v.margen', N.r6(v.ganancia / v.ventas), textoM); else corrige('v.margen', N.r6(v.ganancia / v.ventas), textoM);
      }
    } else {
      anula('v.ganancia', S.porque['v.ganancia']);
      anula('v.margen', S.porque['v.margen']);
    }
  }
  const bancoMes = H.tipo === 'UNIFAMILIAR' ? null : liquida(F.debt);
  if (H.tipo !== 'UNIFAMILIAR') {
    if (vacio('v.banco_mes')) deduce('v.banco_mes', bancoMes, 'mes en que se liquida el banco: el último con saldo, más uno');
    /* el banco que nunca tiene saldo no se liquida en ningún mes: en blanco, como el libro (antes quedaba un 0) */
    else if (bancoMes === null) { corregidos['v.banco_mes'] = { antes: leer('v.banco_mes'), despues: null }; poner('v.banco_mes', null); }
    else corrige('v.banco_mes', bancoMes, 'mes en que se liquida el banco (antes era el mes del saldo máximo)');
  }
  if (vacio('v.capital_mes') && (H.capital || 0) > 0 && fin(v.mes_reparto)) deduce('v.capital_mes', v.mes_reparto, 'el capital regresa al cierre, con el reparto');
  if (vacio('v.respaldo_mes')) deduce('v.respaldo_mes', liquida(F.gapOut), 'mes en que se liquida el respaldo: el último con saldo pendiente, más uno');
  if (vacio('v.pagos_obra') && fin(H.pagosObra)) deduce('v.pagos_obra', M(H.pagosObra), 'preventa por el % que se paga durante la obra');
  if (vacio('v.rend_capital')) deduce('v.rend_capital', 0, H.tipo === 'VERTICAL'
    ? 'el motor no le paga al capital un rendimiento antes de repartir: su preferente va dentro de la cascada, en lo que recibe la alianza'
    : 'el motor no le paga rendimiento al capital: lo devuelve tal cual al cierre');

  /* 6 · reparto */
  if (vacio('v.dueno_aporta')) deduce('v.dueno_aporta', M(H.tierraAportada), H.tipo === 'UNIFAMILIAR' ? 'la tierra se compra: nadie la aporta' : 'superficie × valor del m² × % que aporta el dueño');
  if (vacio('v.dueno_recibe')) deduce('v.dueno_recibe', M(H.dueno), H.tipo === 'UNIFAMILIAR' ? 'el precio del terreno, pagado al arrancar' : 'lo que el motor le paga al dueño');
  /* el dueño que no aporta su tierra la vende a su valor: «veces» no aplica (lo que recibe es su precio) */
  const vendeTierra = fin(v.dueno_aporta) && v.dueno_aporta <= 0.0005 && fin(v.dueno_recibe) && v.dueno_recibe > 0.0005;
  if (vendeTierra) {
    const antes = leer('v.dueno_veces');
    if (antes !== null && antes !== undefined) { poner('v.dueno_veces', null); corregidos['v.dueno_veces'] = { antes, despues: null }; }
    noAplica('v.dueno_veces', 'el dueño no aporta su tierra: la vende a su valor (lo que recibe es su precio)');
  } else if (vacio('v.dueno_veces') && H.tierraValor > 0 && fin(H.dueno)) deduce('v.dueno_veces', N.r6(H.dueno / H.tierraValor), 'lo que recibe el dueño ÷ valor de su tierra');
  if (vacio('v.dueno_meses') && fin(v.mes_reparto)) {
    /* Si además de la tierra en efectivo cobra una parte de la utilidad, lo último lo recibe en el reparto. */
    if ((H.tierraAportada || 0) > 0 || (H.dueno || 0) > (H.tierraEfectivo || 0) + 1) deduce('v.dueno_meses', v.mes_reparto, 'el dueño recibe lo último en el mes de reparto');
    else if ((H.dueno || 0) > 0) deduce('v.dueno_meses', 1, 'la tierra se paga en efectivo en el primer mes');
  }
  /* «En años» es lo mismo que «en cuántos meses recibe lo último», en años (en el libro, dueno_meses = mes de reparto). */
  if (vacio('v.dueno_anos') && fin(v.dueno_meses)) deduce('v.dueno_anos', N.r3(v.dueno_meses / 12), 'meses en que el dueño recibe lo último ÷ 12 (como el libro)');
  if (fin(H.alianza)) {
    if (vacio('v.alianza_recibe')) deduce('v.alianza_recibe', M(H.alianza), H.tipo === 'UNIFAMILIAR' ? 'caja al cierre menos el capital que se devuelve' : 'lo que recibe la alianza menos su capital');
    else if (H.tipo === 'MACROLOTES' || H.tipo === 'RESIDENCIAL') corrige('v.alianza_recibe', M(H.alianza), 'lo que recibe la alianza encima de su capital (antes traía el capital adentro y el visor lo contaba dos veces)');
  }
  /* El capital es de la alianza en los cuatro motores y cobra antes que la utilidad, como en el libro: si la alianza no
     recupera todo su capital, lo que recibe es del capital y su utilidad es 0 (nunca «recibe» negativo). Lo que recupera el
     capital va como total del pago al capital (el motor lo devuelve con el reparto, sin serie por mes). */
  if ((H.capital || 0) > PESO && fin(H.alianza)) {
    e.pagoCapital = H.capital + Math.min(0, H.alianza);
    if (H.alianza < -PESO) corrige('v.alianza_recibe', 0, 'la alianza no recupera todo su capital: lo que recibe al cierre es del capital, que cobra antes que la utilidad, y su utilidad es 0');
  }
  if (vacio('v.otros_ingresos') && (H.otrosIngresos || 0) > PESO) deduce('v.otros_ingresos', M(H.otrosIngresos), 'retorno por financiar del motor (lo que pagan de más quienes compran a plazos): va en las ventas y no es de ningún producto');
  if (vacio('v.inversion_recibe')) deduce('v.inversion_recibe', M(H.inversion), H.tipo === 'UNIFAMILIAR' ? 'el rendimiento que el motor le paga al inversionista' : 'no hay inversionista aparte: el capital es de la alianza y su ganancia va en lo que recibe la alianza');
  if (vacio('v.capital_sobre_tope') && fin(H.capital) && fin(H.ventas)) deduce('v.capital_sobre_tope', N.r3(Math.max(0, H.capital - H.ventas * TOPE_CAPITAL) / 1e6), 'capital − 1/3 de las ventas, si se pasa (regla de Dirección; sólo avisa)');

  /* 7 · revisión para fondos (mismas definiciones del libro del PPP 2) */
  const C = H.costoConTierra, V = H.ventas;
  if (vacio('v.rv_linea_ventas')) deduce('v.rv_linea_ventas', sinBanco ? 'sin banco' : N.r6(H.linea / V), 'tope de deuda del motor ÷ ventas');
  if (vacio('v.rv_linea_costo')) deduce('v.rv_linea_costo', sinBanco ? 'sin banco' : N.r6(H.linea / C), 'tope de deuda del motor ÷ costo con tierra (sin financiamiento)');
  if (vacio('v.rv_aportacion') && C > 0) deduce('v.rv_aportacion', N.r6(((H.tierraAportada || 0) + (H.capital || 0)) / C), '(tierra que aporta el dueño + capital usado) ÷ costo con tierra');
  if (vacio('v.rv_margen') && C > 0 && fin(V)) deduce('v.rv_margen', N.r6((V - C) / C), '(ventas − costo con tierra) ÷ costo con tierra, antes de financiamiento');
  /* Respaldo, con las definiciones del libro: «lo que faltaría» es la SUMA de lo que faltó cada mes (aunque después
     se cure) y «respaldo que haría falta» es el MÁXIMO pendiente. El motor sólo da lo pendiente al cierre. */
  if (T) {
    const faltaTotal = suma(F.gap), maxPend = Math.max(0, ...F.gapOut);
    if (vacio('v.rv_falta')) deduce('v.rv_falta', M(faltaTotal), 'suma de lo que faltó cada mes y nadie cubrió (ni capital ni banco), aunque después se pagara');
    else corrige('v.rv_falta', M(faltaTotal), 'suma de lo que faltó cada mes (antes era sólo lo pendiente al cierre)');
    if (!vacio('v.respaldo')) corrige('v.respaldo', M(maxPend), 'máximo de respaldo pendiente en algún mes (antes era sólo lo pendiente al cierre)');
  }
  const cal = H.cal, obraIni = num(v.obra_inicio);
  const firmasPrueba = cal ? (cal.deptos || cal.firmas) : null, totalFirmas = firmasPrueba ? (cal.total > 0 ? cal.total : suma(firmasPrueba)) : 0;
  if (vacio('v.rv_preventa')) {
    if (fin(H.preventaArranque)) deduce('v.rv_preventa', N.r6(H.preventaArranque), 'lo firmado antes de arrancar la obra, según el motor');
    else if (firmasPrueba && totalFirmas > 0 && fin(obraIni)) deduce('v.rv_preventa', N.r6(suma(firmasPrueba.slice(0, Math.max(0, obraIni - 1))) / totalFirmas), 'unidades firmadas antes del mes de arranque de obra ÷ unidades totales (calendario de ventas del motor)');
  }
  const primerDesembolso = primero(F.draw);
  if (vacio('v.rv_preventa_banco')) {
    if (sinBanco) deduce('v.rv_preventa_banco', 'sin banco', 'el caso no tiene línea de banco');
    else if (primerDesembolso < 0) deduce('v.rv_preventa_banco', 'sin disposición', 'hay línea de banco pero no se dispone');
    else if (firmasPrueba && totalFirmas > 0 && (!cal.parcial || (cal.s0 < 0 || primerDesembolso <= cal.s0))) deduce('v.rv_preventa_banco', N.r6(suma(firmasPrueba.slice(0, primerDesembolso)) / totalFirmas), 'unidades firmadas antes del primer desembolso ÷ unidades totales');
  }
  if (vacio('v.rv_cobertura')) {
    const conSaldo = F.debt.map((x, i) => (x > PESO ? i : -1)).filter(i => i >= 0);
    if (sinBanco) deduce('v.rv_cobertura', 'sin banco', 'el caso no tiene línea de banco');
    else if (!conSaldo.length) deduce('v.rv_cobertura', 'sin saldo del banco', 'el banco nunca tiene saldo');
    else if (cal && cal.firmado) {
      const cob = cal.cobrado || F.rev, porCobrar = acum(cal.firmado.map((x, i) => x - cob[i]));
      deduce('v.rv_cobertura', N.r6(Math.min(...conSaldo.map(i => porCobrar[i] / F.debt[i]))), 'mínimo, en los meses con saldo del banco, de (valor firmado − cobrado) ÷ saldo del banco');
    } else if (cal && cal.parcial && cal.preFirmado && cal.s0 >= 0 && conSaldo.every(i => i < cal.s0)) {
      const porCobrar = acum(cal.preFirmado.map((x, i) => x - F.rev[i]));
      deduce('v.rv_cobertura', N.r6(Math.min(...conSaldo.map(i => porCobrar[i] / F.debt[i]))), 'mínimo, en los meses con saldo del banco (todos antes de la entrega), de (preventa firmada − cobrado) ÷ saldo del banco');
    }
  }
  if (vacio('v.rv_meses_credito')) {
    if (sinBanco) deduce('v.rv_meses_credito', 'sin banco', 'el caso no tiene línea de banco');
    else if (bancoMes === null) deduce('v.rv_meses_credito', 'sin disposición', 'hay línea de banco pero nunca tiene saldo');
    else if (fin(obraIni)) deduce('v.rv_meses_credito', bancoMes - obraIni, 'mes en que se liquida el banco − mes de arranque de obra');
  }
  if (vacio('v.rv_resultado')) deduce('v.rv_resultado', revision(v), 'las nueve pruebas con los límites del libro del PPP 2');
  if (vacio('v.ck_flujo') && fin(H.reconcilia)) mapea('v.ck_flujo', N.r6(H.reconcilia / 1e6), 'cashReconciliation del motor (fuentes − usos de caja)');
  if (vacio('v.ck_cobranza') && fin(H.cobranzaTotal) && fin(V)) mapea('v.ck_cobranza', M(H.cobranzaTotal - V), 'revTotal − ventas del motor');
  if (vacio('v.ck_unidades') && cal && cal.firmas && H.unidades > 0) deduce('v.ck_unidades', N.r3(suma(cal.firmas) - H.unidades), 'unidades firmadas en el calendario − unidades de los productos');

  /* datos */
  if (vacio('datos.tierra.valor') && fin(H.tierraValor)) deduce('datos.tierra.valor', M(H.tierraValor), 'valor total de la tierra del motor');
  if (vacio('datos.lamina.m2_construidos')) {
    if (H.tipo === 'RESIDENCIAL') deduce('datos.lamina.m2_construidos', N.r3(H.m2Construidos), 'casas que construye el proyecto × m² promedio (0 si sólo vende lotes)');
    else if (H.tipo === 'MACROLOTES') deduce('datos.lamina.m2_construidos', 0, 'en «sólo lote» el desarrollador no construye naves');
  }
  if (vacio('datos.din.tasa_capital') && fin(H.reparto && H.reparto.tasa)) deduce('datos.din.tasa_capital', N.r6(H.reparto.tasa), 'el motor no le paga tasa al capital antes de repartir');
  if (vacio('datos.din.apertura') && fin(e.apertura)) mapea('datos.din.apertura', N.r6(e.apertura), 'comisión de disposición del motor');
  if (vacio('datos.cob.enganche') && fin(e.enganche)) mapea('datos.cob.enganche', N.r6(e.enganche), e.engancheDe || 'enganche del motor');
  if (vacio('datos.costo.comision') && fin(e.comision)) mapea('datos.costo.comision', N.r6(e.comision), e.comisionDe || 'comisión del motor');

  /* reparto */
  if (!visor.reparto) visor.reparto = { numero: null, esquema: null, tasa_capital: null, paga_tierra: null, parte_dueno: null, parte_alianza: null, parte_capital: null, honorarios_pct: null };
  const rp = H.reparto || {};
  if (vacio('reparto.esquema') && rp.esquema) deduce('reparto.esquema', rp.esquema, 'es el esquema que usa el motor de su tablero; no es uno de los cinco del libro del PPP 2');
  if (vacio('reparto.paga_tierra') && typeof rp.paga === 'boolean') deduce('reparto.paga_tierra', rp.paga, 'el motor paga o devuelve la tierra a su valor antes de repartir');
  if (rp.modo1) { noAplica('reparto.parte_dueno', 'el dueño cobra un % de las ventas, no de la utilidad'); noAplica('reparto.parte_alianza', 'la alianza se queda con la utilidad que deja la regalía del dueño'); }
  else if (vacio('reparto.parte_dueno') && fin(rp.dueno)) deduce('reparto.parte_dueno', N.r6(rp.dueno), '% de la utilidad del dueño en el motor');
  if (vacio('reparto.parte_capital')) deduce('reparto.parte_capital', 0, 'el capital no tiene parte de la utilidad en el motor');
  if (vacio('reparto.parte_alianza') && fin(visor.reparto.parte_dueno)) deduce('reparto.parte_alianza', N.r6(1 - visor.reparto.parte_dueno - (visor.reparto.parte_capital || 0)), 'lo que queda de la utilidad después de la parte del dueño');
  if (vacio('reparto.tasa_capital') && fin(rp.tasa)) deduce('reparto.tasa_capital', N.r6(rp.tasa), 'el motor no le paga tasa al capital antes de repartir');
  if (vacio('reparto.honorarios_pct') && fin(rp.honorarios)) deduce('reparto.honorarios_pct', N.r6(rp.honorarios), 'el motor no cobra honorario de desarrollo');
  if (vacio('reparto.numero')) {
    const r0 = visor.reparto, s = ESQUEMAS_PPP2.find(x => r0.paga_tierra === x.paga && Math.abs((r0.parte_dueno ?? -1) - x.d) < 1e-6 && Math.abs((r0.parte_alianza ?? -1) - x.a) < 1e-6 && Math.abs((r0.parte_capital ?? -1) - x.c) < 1e-6);
    if (s) deduce('reparto.numero', s.n, 'coincide con el esquema ' + s.n + ' del libro del PPP 2');
  }
  if (vacio('plan.esquema') && visor.reparto.esquema) deduce('plan.esquema', visor.reparto.esquema, 'el esquema del reparto');
  if (vacio('plan.paso_texto') && e.paso) deduce('plan.paso_texto', e.paso, 'hay una propuesta de reestructura de este caso');

  /* vacíos legítimos: el libro del PPP 2 también los deja en blanco en esta situación */
  noAplica('v.banco_mes', 'el banco nunca tiene saldo (el libro también lo deja en blanco)');
  noAplica('v.respaldo_mes', 'nunca hubo respaldo pendiente (el libro también lo deja en blanco)');
  noAplica('v.capital_mes', 'no hay capital aportado');
  noAplica('v.dueno_meses', 'no hay pago al dueño');
  noAplica('v.dueno_anos', 'no hay pago al dueño');
  if (H.tipo === 'UNIFAMILIAR') ['datos.din.apertura', 'datos.din.tiie', 'datos.din.sobretasa'].forEach(k => noAplica(k, 'la casa no usa banco'));
  noAplica('reparto.numero', 'el esquema del motor no es ninguno de los cinco del libro del PPP 2');

  /* lo que de veras no se puede deducir sin inventar (va a la lista de reestructura, con el supuesto que haría falta) */
  falta('v.fecha_aprobacion', 'El PPP de siempre no aprueba versiones. Supuesto: usar la fecha en que Dirección elige la versión (elegida_fecha) al servirla.');
  falta('datos.din.tiie', 'El motor sólo trae una tasa total (PIK). Supuesto: un valor de TIIE para partirla en TIIE + sobretasa.');
  falta('datos.din.sobretasa', 'El motor sólo trae una tasa total (PIK). Supuesto: un valor de TIIE para partirla en TIIE + sobretasa.');
  falta('datos.din.caja_pct', 'El motor barre la caja a cero cada mes: no guarda caja mínima. Supuesto: reservar 5 % del costo de obra (criterio de Dirección) como entrada nueva del motor.');
  falta('datos.din.preventa_minima', 'Este motor no tiene preventa mínima para arrancar obra. Supuesto: la mínima que pida el banco (la revisión usa 35 %).');
  falta('datos.cob.enganche', 'El motor cobra distinto enganche por producto o vende de contado. Supuesto: un enganche único del caso.');
  falta('datos.costo.comision', 'El motor junta comisiones con administración y marketing. Supuesto: qué parte es comisión de venta.');
  falta('datos.din.apertura', 'Sin banco no hay comisión de apertura.');
  falta('datos.lamina.m2_construidos', 'El caso no trae construcción total.');
  falta('v.pagos_obra', 'El motor no separa pagos durante la obra de las mensualidades o saldos. Supuesto: qué parte de cada venta se paga durante la obra.');
  falta('v.mes_saldos', 'El motor no tiene un mes único de saldos.');
  falta('v.ck_flujo', 'El motor no entrega su conciliación de caja; recalcularla aquí sería circular.');
  falta('v.ck_unidades', 'Sin calendario de firmas comprobado no se puede contar.');
  ['rv_preventa', 'rv_preventa_banco', 'rv_cobertura'].forEach(k => falta('v.' + k, 'El calendario de firmas no cuadra con los cobros del motor (p. ej. un libro que vende por etapas). Supuesto: el calendario de ventas de cada etapa.'));
  falta('v.dueno_meses', 'Sin pago al dueño no hay mes.');
  falta('v.dueno_veces', 'Sin valor de la tierra no hay veces.');
  falta('plan.ubicacion', 'El renglón no trae ubicación.');
  falta('plan.edad', 'La edad (semilla → fruto) sólo existe en el libro del PPP 2.');
  falta('plan.candados_abiertos', 'Los candados sólo existen en el libro del PPP 2.');
  falta('plan.paso_texto', 'El siguiente paso lo calcula el libro del PPP 2 con sus preguntas; el PPP de siempre no lo tiene.');
  return { marca, sinLlenar, mapeados, corregidos, noAp, vacios };
}

/* ───────────── por qué va vacío lo que va vacío ───────────── */
/* La razón de cada cifra que el visor enseña y la foto deja vacía, para que el visor diga «no aplica» o «sin dato» con su
   porqué (nunca un «—» mudo ni «la dio el motor»). Viaja en la misma marca `deducido`, empezando con «no aplica:» o
   «sin dato:»; el visor no la toma como deducción. Sale de lo que ya anotó `llena` (no aplica, sin llenar, vacíos a
   propósito) y, para los totales del flujo, de lo que el motor de verdad no tiene. */
const RAZON_FLUJO = {
  caja_minima: 'no aplica: el motor de su tablero no guarda caja mínima; usa cada peso en cuanto entra',
  enganches: 'sin dato: el motor de su tablero no separa lo que cobra en enganches, pagos durante la obra y saldos',
  pagos_obra: 'sin dato: el motor de su tablero no separa lo que cobra en enganches, pagos durante la obra y saldos',
  saldos: 'sin dato: el motor de su tablero no separa lo que cobra en enganches, pagos durante la obra y saldos',
  firmas: 'sin dato: el calendario de ventas no cuadra con los cobros del motor (p. ej. un libro que vende por etapas)'
};
const RAZON_RUTA = /^(v|datos|reparto|productos)\./;
function razonCorta(t) {
  t = String(t || '').replace(/\s*Supuesto:[\s\S]*$/, '').replace(/\s*No se calcula aquí:[\s\S]*$/, '').trim().replace(/\.+$/, '');
  return t.charAt(0).toLowerCase() + t.slice(1);
}
function valorEn(visor, ruta) {
  const p = ruta.split('.');
  if (p[0] === 'v') return (visor.v || {})[p.slice(1).join('.')];
  if (p[0] === 'datos') { const d = (visor.datos || {})[p.slice(1).join('.')]; return d ? d.valor : undefined; }
  if (p[0] === 'reparto') return visor.reparto ? visor.reparto[p[1]] : undefined;
  if (p[0] === 'productos') { const q = (visor.productos || [])[Number(p[1])]; return q ? q[p[2]] : undefined; }
  return undefined;
}
function razonesVacias(visor, marca, ll, noAp) {
  const nulo = x => x === null || x === undefined, pon = (ruta, texto) => { if (!marca[ruta] && texto) marca[ruta] = texto; };
  Object.keys(noAp || {}).forEach(r => { if (RAZON_RUTA.test(r) && nulo(valorEn(visor, r))) pon(r, 'no aplica: ' + razonCorta(noAp[r])); });
  const sin = Object.assign({}, ll.vacios || {}, ll.sinLlenar || {});
  Object.keys(sin).forEach(r => { if (RAZON_RUTA.test(r) && nulo(valorEn(visor, r))) pon(r, 'sin dato: ' + razonCorta(sin[r])); });
  const fl = visor.flujo || {}, filas = fl.filas || {}, total = fl.total || {};
  if (fl.meses) Object.keys(RAZON_FLUJO).forEach(k => { if (!filas[k] && nulo(total[k])) pon('flujo.total.' + k, RAZON_FLUJO[k]); });
}

/* ───────────── textos dentro de los topes del servidor ───────────── */
/* fotoLimpia_ (server/ppp2/Visor.gs) corta cada texto a su tope sin aviso; aquí se cortan antes, en palabra y con «…». */
const TOPES = { 'plan.nombre': 120, 'plan.ubicacion': 200, 'plan.tipo': 200, 'plan.edad': 40, 'plan.paso_texto': 200, 'plan.esquema': 80, 'reparto.esquema': 80 };
function cortaPalabra(t, max) {
  t = String(t);
  if (t.length <= max) return t;
  const c = t.slice(0, max - 1), i = c.lastIndexOf(' ');
  return (i > max * 0.6 ? c.slice(0, i) : c).replace(/[\s,;:·–—-]+$/, '') + '…';
}
function ajustaTextos(visor) {
  Object.keys(TOPES).forEach(r => { const [a, b] = r.split('.'), o = visor[a]; if (o && typeof o[b] === 'string') o[b] = cortaPalabra(o[b], TOPES[r]); });
  Object.keys(visor.v || {}).forEach(k => { if (typeof visor.v[k] === 'string') visor.v[k] = cortaPalabra(visor.v[k], 200); });
  (visor.productos || []).forEach(q => { if (typeof q.nombre === 'string') q.nombre = cortaPalabra(q.nombre, 60); });
  Object.keys(visor.deducido || {}).forEach(k => { visor.deducido[k] = cortaPalabra(visor.deducido[k], 240); });
}

/* El flujo completo, armado otra vez desde las series del motor (las que ya había quedan idénticas, salvo lo
   corregido) más las deducidas, y los totales del desglose de costos. */
function flujoCompleto(visor, H, F, marca, extra) {
  const viejo = visor.flujo || { meses: null, filas: {}, total: {} }, T = F.T;
  if (!T) return viejo;
  const s = { cobranza: F.rev, egresos: F.cost, cap_aporta: F.equity, interes: F.pik, caja: F.caja, cap_acum: F.capAcum, saldo_capital: F.capAcum, flujo_acum: F.flujoAcum };
  if (F.banco) Object.assign(s, { apertura: F.fee, saldo_banco: F.debt, disposicion: F.draw.map((x, i) => x + F.capPik[i] + F.fee[i]), pago_banco: F.repay, ajeno: F.ajenoUso });
  else s.ajeno = H.tipo === 'UNIFAMILIAR' ? F.ajenoUso : F.ajeno;
  if (F.banco && F.ok) Object.assign(s, { respaldo: F.gap, pago_respaldo: F.cure, saldo_respaldo: F.gapOut });
  const cal = H.cal;
  if (cal && cal.firmas) s.firmas = cal.firmas;
  if (cal && cal.enganches) s.enganches = cal.enganches;
  if (cal && cal.saldos) s.saldos = cal.saldos;
  if (cal && cal.pagos_obra) s.pagos_obra = cal.pagos_obra;
  const nuevo = N.armaFlujo(s, { mesReparto: visor.v.mes_reparto });
  /* Lo que el módulo ya había entregado debe quedar igual (salvo la disposición del libro vertical, que se corrige). */
  Object.keys(viejo.filas || {}).forEach(k => {
    const a = viejo.filas[k], b = nuevo.filas[k];
    if (!b) { nuevo.filas[k] = a.slice(0, nuevo.meses).concat(ceros(Math.max(0, nuevo.meses - a.length))); nuevo.total[k] = viejo.total[k]; return; }
    const largo = Math.min(a.length, b.length);
    const dif = Math.max(0, ...a.slice(0, largo).map((x, i) => Math.abs(x - b[i])));
    if (dif > 0.0015) {
      if (k === 'disposicion') marca['flujo.disposicion'] = 'corregido: lo que crece la deuda en el mes (desembolso + comisión + interés capitalizado); así entra y sale del banco cuadran con la caja';
      else if (k === 'ajeno' && H.tipo === 'UNIFAMILIAR') marca['flujo.ajeno'] = 'corregido: capital aportado más lo que se le debe al inversionista, mes a mes (antes contaba sólo al inversionista)';
      else throw new Error('La serie ' + k + ' del módulo no coincide con el motor (dif ' + dif + ').');
    }
  });
  Object.keys(viejo.total || {}).forEach(k => { if (!(k in nuevo.total)) nuevo.total[k] = viejo.total[k]; });
  const MARCAS = {
    cap_acum: 'capital aportado acumulado mes a mes', saldo_capital: 'el capital sigue adentro hasta el cierre (el motor lo devuelve con el reparto)',
    flujo_acum: 'caja − capital aportado − saldo del banco − respaldo pendiente' + (H.tipo === 'UNIFAMILIAR' ? ' − lo que se le debe al inversionista' : ''),
    apertura: 'comisión de disposición del motor, mes a mes', pago_banco: 'lo que baja la deuda en el mes, sin contar el interés que se le suma ni la comisión (cuentas del propio motor)',
    disposicion: 'lo que crece la deuda en el mes: desembolso + comisión + interés capitalizado (identidad del motor)', ajeno: 'saldo del banco + capital aportado + respaldo pendiente',
    respaldo: 'lo que falta en el mes después de cobranza, costos, banco y capital (cuentas del propio motor)', pago_respaldo: 'lo que sobra en el mes y paga el respaldo (cuentas del propio motor)',
    saldo_respaldo: 'respaldo pendiente acumulado', firmas: 'calendario de ventas del motor',
    enganches: H.tipo === 'UNIFAMILIAR' ? 'la casa se cobra completa al escriturar: no hay enganche al firmar'
      : H.tipo === 'MACROLOTES' ? 'el enganche de cada venta, al firmar (calendario de ventas del motor)'
        : cal && cal.parcial ? 'lo que entra antes de la entrega: el enganche de lo que se firma (el libro no tiene pagos durante la obra)' : 'enganche de la preventa repartido en los meses de preventa (como el motor)',
    saldos: H.tipo === 'UNIFAMILIAR' ? 'la venta se cobra completa al escriturar, en el mes de la venta'
      : H.tipo === 'MACROLOTES' ? 'lo que se cobra después de firmar: el saldo al entregar la nave o las mensualidades del lote (calendario de ventas del motor)'
        : cal && cal.parcial ? 'lo que entra desde la entrega: saldos de la preventa y ventas de entrega (el libro no tiene pagos durante la obra)' : 'saldos de la preventa y ventas de entrega repartidos en los meses de entrega (como el motor)',
    pagos_obra: H.tipo === 'UNIFAMILIAR' ? 'la casa se cobra completa al escriturar: no hay pagos durante la obra'
      : cal && cal.parcial ? 'el libro no tiene pagos durante la obra (% durante la obra = 0)' : 'cobranza − enganches − saldos (el motor la reparte con la curva de obra)'
  };
  Object.keys(nuevo.filas).forEach(k => { if (!(viejo.filas || {})[k] && MARCAS[k] && !marca['flujo.' + k]) marca['flujo.' + k] = MARCAS[k]; });
  if (F.banco && !(viejo.filas || {}).ajeno && nuevo.filas.ajeno) marca['flujo.ajeno'] = MARCAS.ajeno;
  /* Desglose de costos (totales, sin serie mensual: el motor no reparte cada partida por mes en su salida). */
  const c = H.costos;
  if (c) {
    const TEXTO = {
      VERTICAL: { obra: 'la obra directa del motor', indirectos: 'los indirectos del motor (proyecto, permisos y legales)', imprevistos: 'las contingencias del motor', comisiones: 'la comisión de venta del motor', cierre: 'el cierre de la compra de la tierra del motor' },
      MACROLOTES: { obra: 'urbanización + construcción (directo)', indirectos: 'directo × (estudios + licencias + supervisión) + ingresos × (legal + administración)', imprevistos: 'directo × imprevistos', comisiones: 'ingresos × (comisión + marketing)', cierre: 'el motor no tiene cierre de tierra' + (H.regalia ? ' (la regalía del dueño, un % de cada venta, va en lo que él recibe: el reparto)' : '') },
      RESIDENCIAL: { obra: 'urbanización + casas + casa club', indirectos: 'urbanización × trámites + donación pagada + otros costos', imprevistos: 'urbanización × imprevistos', comisiones: 'costos blandos sobre ingresos: administración + comisiones + marketing (el motor los junta)', cierre: 'el motor no tiene costo de cierre' }
    }[H.tipo] || {};
    Object.keys(TEXTO).forEach(k => {
      if (nuevo.total[k] === undefined && fin(c[k])) { nuevo.total[k] = N.r3(c[k] / 1e6); marca['flujo.total.' + k] = TEXTO[k]; }
    });
  }
  /* La casa no tiene gastos de cierre de la compra del terreno: su motor no los cobra (el cuadro 4 suma igual las ventas). */
  if (H.tipo === 'UNIFAMILIAR' && nuevo.total.cierre === undefined) { nuevo.total.cierre = 0; marca['flujo.total.cierre'] = 'el motor de la casa no tiene gastos de cierre de la compra del terreno'; }
  /* Lo que recupera el capital al cierre (ver llena: cobra antes que la utilidad). Total sin serie por mes. */
  const pc = extra && extra.pagoCapital;
  if (fin(pc) && nuevo.total.pago_capital === undefined) {
    nuevo.total.pago_capital = N.r3(pc / 1e6);
    marca['flujo.total.pago_capital'] = 'lo que recupera el capital al cierre, con el reparto: lo que recibe la alianza, hasta lo que puso (cobra antes que la utilidad, como en el libro); el motor no lo paga mes a mes';
  }
  return nuevo;
}

/* Productos: lo que sale de dividir cifras que ya trae el cuadro (o de la regla de precio del motor). */
function productosCompletos(visor, H, r, marca, noAp) {
  const P = visor.productos || [], na = noAp || {};
  if (H.tipo === 'VERTICAL') {
    const res = (num(r.presaleRev) || 0) + (num(r.postRev) || 0), m2 = ['m2Loft', 'm2Dos', 'm2Tres'].map(k => num(r[k]) || 0), tot = suma(m2);
    P.forEach((q, i) => {
      if (/^Deptos [ABC]/.test(q.nombre) && q.ventas === null && tot > 0 && res > 0) {
        const j = 'ABC'.indexOf(q.nombre.charAt(7));
        if (j >= 0) {
          q.ventas = N.r3(N.mdp(res * m2[j] / tot)); marca['productos.' + i + '.ventas'] = 'ventas de vivienda × m² de la tipología ÷ m² de vivienda (el motor cobra el mismo $/m² a todas)';
          /* esas ventas llevan el descuento de preventa; el precio por m² del módulo es el de lista: el promedio es el que casa */
          if (fin(q.precio_m2) && q.m2 > 0 && Math.abs(q.ventas * 1e6 - q.m2 * q.precio_m2) > 0.005 * Math.abs(q.ventas * 1e6)) {
            const lista = q.precio_m2;
            q.precio_m2 = N.r3(q.ventas * 1e6 / q.m2);
            marca['productos.' + i + '.precio_m2'] = 'corregido: precio promedio = ventas del producto ÷ m² (el de lista, $' + Math.round(lista).toLocaleString('en-US') + ' por m², no lleva el descuento de preventa)';
          }
        }
      }
    });
  }
  P.forEach((q, i) => {
    /* un producto sin ventas en esta versión no tiene precio promedio (0 ÷ unidades no es un precio) */
    const sinVentas = fin(q.ventas) && Math.abs(q.ventas) < 1e-9 && ((q.m2 || 0) > 0 || (q.unidades || 0) > 0);
    if (sinVentas) { if (q.precio_unidad === null) na['productos.' + i + '.precio_unidad'] = 'el producto no tiene ventas en esta versión: no hay precio promedio'; }
    if (q.precio_unidad === null && fin(q.ventas) && !sinVentas && q.unidades > 0) { q.precio_unidad = N.r3(q.ventas / q.unidades); marca['productos.' + i + '.precio_unidad'] = 'ventas del producto ÷ unidades (promedio)'; }
    if (q.precio_m2 === null && fin(q.ventas) && !sinVentas && q.m2 > 0 && !/renta/i.test(q.nombre)) { q.precio_m2 = N.r3(q.ventas * 1e6 / q.m2); marca['productos.' + i + '.precio_m2'] = 'ventas del producto ÷ m² (promedio)'; }
    if (q.precio_m2 === null && /renta/i.test(q.nombre)) na['productos.' + i + '.precio_m2'] = 'en renta no hay precio de venta por m²';
    if (q.unidades === null) { na['productos.' + i + '.unidades'] = 'se vende por m², no por unidad'; if (q.precio_unidad === null) na['productos.' + i + '.precio_unidad'] = 'se vende por m², no por unidad'; }
    if (q.m2 === null && /cajones/i.test(q.nombre)) { na['productos.' + i + '.m2'] = 'los cajones se venden por pieza'; if (q.precio_m2 === null) na['productos.' + i + '.precio_m2'] = 'los cajones se venden por pieza'; }
  });
  return P;
}

/* Datos que dependen del motor y no pasan por los hechos comunes. */
function extras(tipo, r) {
  const p = r.p || {}, o = {};
  if (tipo === 'MACROLOTES') {
    o.apertura = num(p.feeDeuda);
    const naves = !r.rentaN && !r.loteNaves && (r.nNaves || 0) > 0, lotes = (r.nMacro || 0) + (r.rentaC ? 0 : (r.nCom || 0)) + (r.nViv || 0) + (r.loteNaves ? (r.nNavesLote || 0) : 0) > 0;
    if (naves && lotes && num(p.engNave) !== num(p.engLote)) o.enganche = null;
    else if (naves) { o.enganche = num(p.engNave); o.engancheDe = 'enganche de las naves'; } else if (lotes) { o.enganche = num(p.engLote); o.engancheDe = 'enganche de los lotes'; }
  }
  if (tipo === 'UNIFAMILIAR') { o.comision = (num(p.leads) || 0) + (num(p.cierre) || 0); o.comisionDe = 'comisión de leads + comisión de cierre del motor'; }
  return o;
}
/* Primer mes en que entra un pago que no es enganche. */
function mesSaldosDe(tipo, r, H) {
  const p = r.p || {};
  if (tipo === 'MACROLOTES' && H.cal) {
    const i = primero(H.cal.saldoCob);
    return i < 0 ? { mes: null, noAplica: 'todo se renta: no hay saldos de una venta' } : { mes: i + 1, texto: 'primer mes con saldo cobrado (entrega de naves o mensualidad de lotes) en el calendario de ventas del motor' };
  }
  if (tipo === 'RESIDENCIAL' && (r.nLotesPel || 0) > 0 && num(p.inicioVentas) !== null) {
    const c = [];
    if ((p.pctCred || 0) > 0) c.push(Math.max(p.inicioVentas, (r.mesesUrb || 0) - 1) + 1);
    if (((p.pctCont || 0) > 0 && (p.mesesContado || 0) >= 1) || (p.pctFin || 0) > 0) c.push(p.inicioVentas + 1);
    return c.length ? { mes: Math.min(...c), texto: 'primer mes con saldo de los lotes: el mes siguiente a la primera venta, o al terminar la urbanización si se escritura con crédito' } : null;
  }
  if (tipo === 'UNIFAMILIAR') return { mes: r.totalMonths, texto: 'la casa se cobra completa en el mes de la venta' };
  return null;
}

/* ───────────── qué cambia contra la versión anterior ───────────── */
function etiquetas(html) {
  const out = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0], id = (tag.match(/\sid\s*=\s*"([^"]+)"/) || [])[1];
    if (!id || !/type\s*=\s*"range"/i.test(tag)) continue;
    /* el rótulo más cercano antes del deslizante: un <label> o, en los interruptores, su <div class="sw-lbl"> */
    const antes = html.slice(Math.max(0, m.index - 700), m.index);
    const ls = [...antes.matchAll(/<label[^>]*>([\s\S]*?)<\/label>|<div[^>]*class="[^"]*\bsw-lbl\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    if (!ls.length) continue;
    const ult = ls[ls.length - 1], t = (ult[1] !== undefined ? ult[1] : ult[2]).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().split(/ \(| · /)[0].trim();
    if (t) out[id] = t;
  }
  return out;
}
/* Del `const p={…}` de computar(): qué deslizante alimenta cada parámetro (para nombrar lo que cambia en un libro). */
function parametros(html) {
  const out = {}, i = html.indexOf('const p={'), j = html.indexOf('};', i);
  if (i < 0 || j < 0) return out;
  for (const m of html.slice(i, j).matchAll(/(\w+):[^,]*?gv\('(in\w+)'\)/g)) out[m[1]] = m[2];
  return out;
}
function queCambia(actual, anterior, nombres, deP, ordenAnterior) {
  if (!anterior) return 'Primera versión del caso';
  const a = actual.vals || actual.p || {}, b = anterior.vals || anterior.p || {}, vistos = [];
  Object.keys(a).forEach(k => {
    const x = a[k], y = b[k];
    if (typeof x === 'object' || typeof y === 'object') return;
    if (x === y || (fin(x) && fin(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y)))) return;
    const id = actual.vals ? k : deP[k];
    const t = (id && nombres[id]) || null;
    if (t && !vistos.includes(t)) vistos.push(t);
  });
  if (actual.viv && anterior.viv && JSON.stringify(actual.viv) !== JSON.stringify(anterior.viv)) vistos.push('Vivienda');
  if (!vistos.length) return 'Mismas entradas que V' + ordenAnterior;
  const lista = vistos.slice(0, 4).join(', ') + (vistos.length > 4 ? ' y ' + (vistos.length - 4) + ' más' : '');
  return ('Cambia contra V' + ordenAnterior + ': ' + lista).slice(0, 160);
}

/* ───────────── criterios de Dirección ───────────── */
/* Con lo que ya trae la foto completada y los hechos del motor. Utilidad real = lo que se reparte menos la tierra
   que aportó el dueño a su valor (con «50/50 con tierra pagada», lo que se parte entre dueño y alianza). */
function criterios(visor, H, F) {
  const v = visor.v, T = F.T, R = T ? F.flujoAcum[T - 1] : null;
  const utilReal = fin(R) ? R - (H.tierraAportada || 0) : null;
  const veces = H.tierraValor > 0 && fin(H.dueno) ? H.dueno / H.tierraValor : null;
  const sumaReparto = fin(R) && fin(H.dueno) && fin(H.alianza) ? (H.dueno - (H.tierraEfectivo || 0)) + H.alianza + (H.tipo === 'UNIFAMILIAR' ? 0 : (H.inversion || 0)) : null;
  const obra = H.costos && fin(H.costos.obra) ? H.costos.obra : null;
  const oi = num(v.obra_inicio) || 1, of = num(v.fin_obra) || T;
  const cajaMin = T ? Math.min(...F.caja.slice(Math.max(0, oi - 1), Math.max(oi, Math.min(T, of)))) : null;
  const faltaTotal = suma(F.gap), maxPend = T ? Math.max(0, ...F.gapOut) : 0;
  const out = {
    utilidad_real: utilReal, utilidad_motor: fin(v.ganancia) ? v.ganancia * 1e6 : null, margen: num(v.margen), margen_antes_fin: num(v.rv_margen),
    dueno_veces: veces, reparto_suma: sumaReparto === null ? null : Math.abs(sumaReparto - R) <= Math.max(1000, 1e-4 * Math.abs(R)),
    respaldo: maxPend, falta_total: faltaTotal, respaldo_cierre: H.respaldo, caja_min_obra: cajaMin, caja_meta: obra === null ? null : CAJA_MINIMA * obra,
    capital: H.capital, tope_capital: fin(H.ventas) ? H.ventas * TOPE_CAPITAL : null,
    esquema: visor.reparto && visor.reparto.numero === 2 ? '50/50 con tierra pagada' : (visor.reparto && visor.reparto.esquema) || null,
    revision: v.rv_resultado
  };
  out.cumple = {
    utilidad: utilReal === null ? null : utilReal > 0,
    dueno: veces === null ? null : veces >= 1 - 1e-6,
    reparto: out.reparto_suma,
    caja: faltaTotal < 1e4 && (cajaMin === null || cajaMin >= -PESO),
    caja_5: cajaMin === null || out.caja_meta === null ? null : cajaMin >= out.caja_meta,
    capital: out.tope_capital === null || !fin(H.capital) ? null : H.capital <= out.tope_capital + 1
  };
  out.falla = ['utilidad', 'dueno', 'reparto', 'caja'].filter(k => out.cumple[k] === false);
  return out;
}

/* ───────────── completar una foto, un caso, un ensayo ───────────── */
/* Completa UN renglón de PPP_VISOR (de N.tomaFoto). Devuelve el renglón nuevo con `aseo` aparte (no es columna). */
function completaFila(fila, ctx) {
  const { tipo, mod, caso, version, motor } = ctx;
  const res = resultado(tipo, mod, caso, version, motor);
  if (N.huella(res.entradas) !== fila.huella_entradas) throw new Error('Las entradas no son las de la foto (huella distinta): ' + (version.nombre || version.id));
  const visor = JSON.parse(fila.visor_json);
  const F = normaliza(tipo, res.r, res.flows, res.libro);
  const H = hechos(tipo, res.r, F, visor);
  const ms = mesSaldosDe(tipo, res.r, H);
  const ex = Object.assign(extras(tipo, res.r), { huella: fila.huella_entradas, queCambia: ctx.queCambia, paso: ctx.paso, mesSaldos: ms && ms.mes, mesSaldosTexto: ms && ms.texto });
  const antes = cuentaVacios(visor), noAp = {}, seriesModulo = Object.keys((visor.flujo && visor.flujo.filas) || {}), totalesModulo = Object.keys((visor.flujo && visor.flujo.total) || {});
  ex.noAp = noAp;
  if (ms && ms.noAplica) noAp['v.mes_saldos'] = ms.noAplica;
  const ll = llena(visor, H, F, ex);
  visor.flujo = flujoCompleto(visor, H, F, ll.marca, ex);
  visor.productos = productosCompletos(visor, H, res.r, ll.marca, noAp);
  razonesVacias(visor, ll.marca, ll, noAp);
  visor.deducido = ll.marca;
  ajustaTextos(visor);
  const problemas = validaCompleta(visor);
  if (problemas.length) throw new Error('La foto completada no pasa: ' + problemas.slice(0, 5).join('; '));
  const json = JSON.stringify(visor);
  if (json.length > N.VISOR_MAX) throw new Error('visor_json completado mide ' + json.length + ' caracteres.');
  const out = Object.assign({}, fila, { visor_json: json });
  /* Lo que se dejó vacío a propósito (ganancia sin el sentido del visor) lleva su razón en la conciliación;
     la utilidad que se concilia contra el resumen guardado sigue siendo la del motor. */
  if (Object.keys(ll.vacios).length) {
    let c = null;
    try { c = JSON.parse(fila.conciliacion || 'null'); } catch (e) { c = null; }
    out.conciliacion = JSON.stringify(Object.assign(c && typeof c === 'object' && !Array.isArray(c) ? c : {}, { vacios: ll.vacios }));
  }
  const despues = cuentaVacios(visor);
  out.aseo = {
    vacios_antes: antes, vacios_despues: despues.filter(k => !noAp[k]), no_aplica: noAp, series_modulo: seriesModulo, totales_modulo: totalesModulo, deducidos: Object.keys(ll.marca).length,
    mapeados: ll.mapeados, corregidos: ll.corregidos, sin_llenar: ll.sinLlenar, notas: F.notas, criterios: criterios(visor, H, F)
  };
  return out;
}
/* Cuántos huecos (null) quedan en los cuadros, sin contar lo que pone el servidor. */
const NO_CUENTAN = ['v.estado', 'v.nombre', 'plan.vigente', 'plan.nombre'];
function cuentaVacios(visor) {
  const l = [];
  Object.keys(visor.v || {}).forEach(k => { if (visor.v[k] === null) l.push('v.' + k); });
  Object.keys(visor.datos || {}).forEach(k => { if (!visor.datos[k] || visor.datos[k].valor === null) l.push('datos.' + k); });
  if (!visor.reparto) l.push('reparto'); else Object.keys(visor.reparto).forEach(k => { if (visor.reparto[k] === null) l.push('reparto.' + k); });
  Object.keys(visor.plan || {}).forEach(k => { if (visor.plan[k] === null) l.push('plan.' + k); });
  (visor.productos || []).forEach((q, i) => Object.keys(q).forEach(k => { if (q[k] === null) l.push('productos.' + i + '.' + k); }));
  return l.filter(x => !NO_CUENTAN.includes(x));
}
/* N.valida más la clave `deducido` (objeto ruta → texto). */
function validaCompleta(visor) {
  const copia = Object.assign({}, visor);
  delete copia.deducido;
  const e = N.valida(copia);
  const dd = visor.deducido;
  if (dd !== undefined && (dd === null || typeof dd !== 'object' || Array.isArray(dd))) e.push('deducido no es objeto');
  else Object.keys(dd || {}).forEach(k => { if (typeof dd[k] !== 'string' || !dd[k]) e.push('deducido.' + k + ' sin texto'); });
  const nan = JSON.stringify(visor).match(/NaN|Infinity/);
  if (nan) e.push('trae ' + nan[0]);
  return e;
}

/* Las versiones de un caso, como las ve el núcleo. */
function versionesDe(mod, caso, motor) {
  return typeof mod.versiones === 'function' ? mod.versiones(caso, { nucleo: N, motor }) : N.versionesDeRenglon(caso.renglon);
}
/* Una «Propuesta de reestructura»: versión nueva del caso con las entradas de su versión base más `cambios`.
   `spec` = {base: orden, cambios: {inX: valor}, porque: 'una línea', nombre?: 'texto'}. */
function versionReestructura(tipo, caso, todas, spec, motor) {
  const base = todas.find(x => Number(x.orden) === Number(spec.base));
  if (!base) throw new Error('La reestructura no encuentra su versión base ' + spec.base + '.');
  if (base.hoja) throw new Error('La reestructura corre el motor del tablero; una versión de libro nativo no se reestructura aquí.');
  const nombre = (PREFIJO_REESTRUCTURA + (spec.nombre ? ' · ' + spec.nombre : '')).slice(0, 40);
  const inputs = Object.assign({}, base.escenario && base.escenario.inputs ? base.escenario.inputs : {}, spec.cambios || {});
  const escenario = { id: ID_REESTRUCTURA, nombre, esBase: false, activo: false, inputs };
  if (tipo === 'RESIDENCIAL') escenario.vivienda = base.escenario && base.escenario.vivienda ? base.escenario.vivienda : motor.contexto.viviendaDefault();
  return { id: ID_REESTRUCTURA, nombre, orden: Math.max(...todas.map(x => x.orden)) + 1, activa: false, escenario, base };
}

function cargaModulo(tipo) {
  const def = N.MOTORES[tipo];
  if (!def) throw new Error('tipo sin motor: ' + tipo);
  return require(path.join(__dirname, def.modulo + '.cjs'));
}

/* Un nombre de versión que nombra a una persona se cambia por uno neutro (opción, tamaño, esquema). Lo decide
   quien arma la entrada (`caso.renombra` = {orden: 'nombre neutro'}): aquí no hay nombres. El módulo y el núcleo
   reciben ya la versión renombrada, así que el nombre nuevo llega a la columna, a `v.nombre` y al `origen`. */
function conNombres(mod, caso) {
  const ren = caso.renombra || {};
  if (!Object.keys(ren).length) return mod;
  return Object.assign({}, mod, {
    versiones: (c, x) => versionesDe(mod, c, x && x.motor).map(v => (ren[v.orden] ? Object.assign({}, v, { nombre: String(ren[v.orden]).slice(0, 40) }) : v))
  });
}

/* Todo un caso: fotos del núcleo, completadas; y, si se pide, su propuesta de reestructura.
   Opciones del caso (las pone quien arma la entrada; datos privados, fuera del repo):
     reestructura: {base, cambios, porque, nombre?}   renombra: {orden: nombre}
     no_servir: [orden, …] y no_servir_porque: texto  → esas fotos quedan `propuesta` (no se sirven).
   `elegida`: no se decide aquí. Se deja la que puso el núcleo (la de la hoja la conserva quien escribe) y una
   propuesta de reestructura nunca queda elegida. */
function completaCaso(caso, opciones) {
  const o = opciones || {}, tipo = String(caso.tipo || '').toUpperCase(), mod = conNombres(o.modulo || cargaModulo(tipo), caso);
  const motor = o.motor || N.motor(tipo), calculado = o.calculado || N.ahora(o.fecha);
  const todas = versionesDe(mod, caso, motor);
  const r0 = N.tomaFotos(mod, caso, { motor, calculado, tolerancia: o.tolerancia });
  const nombres = Object.assign(etiquetas(motor.html), {}), deP = parametros(motor.html);
  let re = null;
  if (caso.reestructura) re = versionReestructura(tipo, caso, todas, caso.reestructura, motor);
  const lista = re ? todas.concat([re]) : todas;
  const paso = re ? 'Revisar la propuesta de reestructura (V' + re.orden + ')' : null;
  /* Entradas de cada versión (para «qué cambia»): se calculan una vez. */
  const ent = {};
  lista.forEach(v => { try { ent[v.orden] = resultado(tipo, mod, caso, v, motor).entradas; } catch (e) { ent[v.orden] = null; } });
  const fotos = [], errores = r0.errores.slice();
  const filas = r0.fotos.slice();
  if (re) {
    try { filas.push(N.tomaFoto(mod, caso, re, { motor, calculado, todas: lista })); }
    catch (e) { errores.push({ caso_id: caso.renglon.caso_id, orden: re.orden, escenario_id: re.id, error: 'reestructura: ' + String(e && e.message || e) }); }
  }
  filas.forEach(f => {
    const v = lista.find(x => Number(x.orden) === Number(f.orden));
    try {
      const anterior = ent[v.orden - 1] && v.id !== ID_REESTRUCTURA ? ent[v.orden - 1] : null;
      const qc = v.id === ID_REESTRUCTURA ? caso.reestructura.porque : (ent[v.orden] ? queCambia(ent[v.orden], anterior, nombres, deP, v.orden - 1) : null);
      const out = completaFila(f, { tipo, mod, caso, version: v, motor, queCambia: qc, paso });
      if (re || caso.nombre_neutro) {
        const vis = JSON.parse(out.visor_json);
        /* la reestructura aparece en la lista de versiones de todas las fotos del caso */
        if (re && !vis.versiones.some(x => x.n === re.orden)) vis.versiones.push({ n: re.orden, nombre: re.nombre, estado: null });
        /* un nombre de caso que nombra a una persona se enseña neutro en el visor (la hoja no cambia) */
        if (caso.nombre_neutro) { vis.plan.nombre = String(caso.nombre_neutro).slice(0, 120); out.aseo.nombre_neutro = true; }
        out.visor_json = JSON.stringify(vis);
      }
      if (v.id === ID_REESTRUCTURA) out.aseo.reestructura = { base: re.base.orden, cambios: caso.reestructura.cambios, porque: caso.reestructura.porque };
      fotos.push(out);
    } catch (e) { errores.push({ caso_id: caso.renglon.caso_id, orden: f.orden, escenario_id: f.escenario_id, error: 'completar: ' + String(e && e.message || e) }); }
  });
  /* Decisión de Dirección: estas versiones no se sirven. */
  const noServir = (caso.no_servir || []).map(Number);
  fotos.forEach(f => {
    if (!noServir.includes(Number(f.orden))) return;
    f.estado = 'propuesta';
    f.aseo.no_servir = caso.no_servir_porque || 'Dirección decidió no servirla';
  });
  /* La elegida sigue siendo la de antes (si todavía se sirve); una propuesta de reestructura nunca queda elegida. */
  const elegidaAntes = r0.fotos.find(f => f.elegida === 'sí');
  fotos.forEach(f => { f.elegida = elegidaAntes && Number(f.orden) === Number(elegidaAntes.orden) && f.estado === 'lista' && f.escenario_id !== ID_REESTRUCTURA ? 'sí' : ''; });
  return { fotos, errores };
}

function ensayo(entrada, salida, opciones) {
  const o = opciones || {}, fuera = path.resolve(salida);
  if (fuera === N.RAIZ || fuera.startsWith(N.RAIZ + path.sep)) throw new Error('El ensayo no escribe dentro del repositorio: usa una carpeta fuera de él.');
  const crudo = JSON.parse(fs.readFileSync(entrada, 'utf8'));
  const casos = (Array.isArray(crudo) ? crudo : (crudo.casos || [])).filter(c => c && !c.fuera);
  const calculado = o.calculado || N.ahora(o.fecha), motores = {}, fotos = [], errores = [];
  casos.forEach((caso, i) => {
    const tipo = String(caso.tipo || '').toUpperCase();
    try {
      if (!motores[tipo]) motores[tipo] = N.motor(tipo);
      const r = completaCaso(caso, { motor: motores[tipo], calculado });
      r.fotos.forEach(f => fotos.push(f));
      r.errores.forEach(e => errores.push(Object.assign({ i, tipo }, e)));
    } catch (e) { errores.push({ i, tipo, caso_id: caso.renglon && caso.renglon.caso_id, error: String(e && e.message || e) }); }
  });
  const out = {
    esquema: 'ppp1-fotos-completas-v1', generado: calculado, columnas: N.COLUMNAS, fotos, errores,
    resumen: {
      casos: casos.length, fotos: fotos.length, listas: fotos.filter(f => f.estado === 'lista').length, propuestas: fotos.filter(f => f.estado === 'propuesta').length,
      elegidas: fotos.filter(f => f.elegida === 'sí').length, reestructuras: fotos.filter(f => f.escenario_id === ID_REESTRUCTURA).length,
      vacios_antes: suma(fotos.map(f => f.aseo.vacios_antes.length)), vacios_despues: suma(fotos.map(f => f.aseo.vacios_despues.length)),
      deducidos: suma(fotos.map(f => f.aseo.deducidos)), errores: errores.length
    }
  };
  fs.mkdirSync(path.dirname(fuera), { recursive: true });
  fs.writeFileSync(fuera, JSON.stringify(out, null, 2));
  return out;
}

module.exports = {
  PREFIJO_REESTRUCTURA, ID_REESTRUCTURA, TOPE_CAPITAL, CAJA_MINIMA, PRUEBAS, ESQUEMAS_PPP2,
  resultado, normaliza, calendarioVertical, calendarioMacro, calendarioResidencial, calendarioUnifamiliar, hechos, revision, llena,
  flujoCompleto, productosCompletos, criterios, completaFila, completaCaso, versionReestructura, cuentaVacios, validaCompleta,
  etiquetas, parametros, queCambia, liquida, ensayo, razonesVacias, cortaPalabra, ajustaTextos
};

/* Línea de órdenes: node scripts/visor-fotos/completa.cjs ensayo <entrada.json> <salida.json> [--fecha "AAAA-MM-DD HH:mm"] */
if (require.main === module) {
  const [orden, entrada, salida, ...resto] = process.argv.slice(2);
  if (orden !== 'ensayo' || !entrada || !salida) {
    console.error('Uso: node scripts/visor-fotos/completa.cjs ensayo <entrada.json> <salida.json> [--fecha "AAAA-MM-DD HH:mm"]');
    process.exit(2);
  }
  const i = resto.indexOf('--fecha');
  const out = ensayo(entrada, salida, { calculado: i >= 0 ? resto[i + 1] : undefined });
  console.log(JSON.stringify(out.resumen));
  out.errores.forEach(e => console.error('· ' + (e.caso_id || '#' + e.i) + ' (' + e.tipo + ' v' + (e.orden || '?') + '): ' + e.error));
  process.exit(out.errores.length ? 1 : 0);
}
