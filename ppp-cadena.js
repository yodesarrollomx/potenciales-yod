/* PPP · diagrama en cadena: 1 Se vende → 2 Entra y sale → 3 En el banco y prestado → 4 Lo que queda.
   Sólo presentación. Lee el estado que ya confirmó el motor del tablero (o Sheets, en modo nativo):
   no calcula resultados financieros, no usa la red y no guarda nada. Un adaptador por tipo de plan
   traduce ese estado al mismo modelo de cuatro eslabones. Contrato: docs/ppp-cadena.md. */
(function (root) {
  'use strict';

  /* ═════════ 1 · Lectura del estado (pura: se prueba en Node, sin pantalla) ═════════ */
  const ok = v => typeof v === 'number' && Number.isFinite(v), nz = v => (ok(v) ? v : 0);
  const dinero = v => !ok(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) / 1e6).toFixed(1) + ' M';   // igual que el HUD
  const corto = v => !ok(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 99.95e6 ? String(Math.round(Math.abs(v) / 1e6)) : (Math.abs(v) / 1e6).toFixed(1)) + ' M';
  const pct = (v, d = 0) => ok(v) ? (v * 100).toFixed(d) + '%' : '—';
  const num = (v, d = 0) => ok(v) ? v.toLocaleString('es-MX', { maximumFractionDigits: d }) : '—';
  const maximo = a => a.reduce((s, x) => (x > s ? x : s), 0), suma = a => a.reduce((s, x) => s + x, 0);
  const vendidas = m => m.vende.series[0].porMes.map((_, i) => m.vende.series.reduce((s, x) => s + x.porMes[i], 0));
  const TITULOS = { A: 'Se vende', B: 'Entra y sale', C: 'En el banco y prestado', D: 'Lo que queda' };
  const POR_ESO = { A: 'todo empieza por lo que se vende', B: 'por eso el dinero entra y sale así', C: 'por eso hace falta capital y crédito', D: 'y al final queda esto' };

  /* Cada adaptador devuelve el mismo modelo o null si al estado le falta lo esencial.
     Aquí sólo se acomodan por mes cantidades que el motor ya resolvió: ninguna cifra nueva. */
  const adaptadores = {
    vertical(r) {
      const p = (r && r.p) || {}, f = r && Array.isArray(r.flows) ? r.flows : [], N = f.length;
      if (!N || !ok(r.sales) || !ok(r.profit)) return null;
      const col = k => f.map(x => nz(x[k]));
      const pre = Math.max(0, Math.min(N, Math.round(nz(p.preMonths)))), ent = Math.max(1, Math.min(N, Math.round(nz(p.delivery)) || 1));
      const resto = ok(r.units) && ok(r.presaleUnits) ? Math.max(0, r.units - r.presaleUnits) : null;
      // Calendario de venta que declara el motor: preventa pareja en sus meses; lo demás, parejo en la entrega.
      const vPre = Array(N).fill(0), vEnt = Array(N).fill(0);
      for (let i = 0; i < pre; i++) vPre[i] = nz(r.presaleUnitsPerMonth);
      if (resto !== null) for (let i = N - ent; i < N; i++) vEnt[i] = resto / ent;
      let cap = 0, fal = 0; const capital = [], falta = [];
      f.forEach(x => { cap += nz(x.equity); fal += nz(x.gap) - nz(x.gapCure); capital.push(cap); falta.push(Math.max(0, fal)); });
      const faltaMax = maximo(falta);   // lo más que llega a faltar en un mes, aunque después se cubra
      return {
        tipo: 'vertical', meses: N,
        hitos: { preventaHasta: pre, obraDesde: Math.max(1, Math.min(N, nz(r.buildStart) + 1)), obraHasta: Math.max(1, Math.min(N, nz(r.buildFinish))), entregaDesde: N - ent + 1 },
        vende: { unidad: ['depa', 'depas'], series: [{ id: 'preventa', nombre: 'En preventa', porMes: vPre }, { id: 'entrega', nombre: 'En la entrega', porMes: vEnt }],
          total: r.units, enPreventa: r.presaleUnits, ritmo: r.presaleUnitsPerMonth, mesesPreventa: pre, resto, mesesEntrega: ent, avanceAlArrancar: r.preventaAtBuild, ventas: r.sales,
          productos: [['Vivienda en preventa', r.presaleRev], ['Vivienda en la entrega', r.postRev], ['Locales', r.comRev], ['Cajones', r.parkingRev]].map(([nombre, monto]) => ({ nombre, monto })) },
        flujo: { entra: col('rev'), sale: col('cost'), interes: col('cashPik'), totalEntra: r.revTotal, totalSale: r.costTotal, alFirmar: p.eng, enObra: p.obra },
        banco: { caja: col('caja'), capital, credito: col('debt'), falta, tope: r.debtCap, pico: r.peak, mesPico: r.peakMonth, capitalUsado: r.equityUsed, faltante: r.fundingGap, faltaMax, mesFalta: falta.indexOf(faltaMax) + 1, deudaFinal: r.debt, cajaFinal: r.cash },
        queda: { ventas: r.sales, costo: r.projectCost, financiamiento: ok(r.interest) && ok(r.feeDebt) ? r.interest + r.feeDebt : null, utilidad: r.profit, margen: r.margin, tir: r.devIrr,
          socios: [{ id: 'dueno', nombre: 'Dueño del terreno', recibe: r.ownerTotalProceeds, gana: r.ownerGain }, { id: 'desarrollador', nombre: 'Desarrollador', recibe: r.devDist, gana: r.devGain }] },
        // De qué tarjeta del plan sale cada eslabón y qué controles lo mueven.
        fuentes: { A: { tarjeta: 'dVentas', nombre: 'Ventas e ingresos', ajustes: [['Ritmo', 'inVel', 'Ritmo de preventa'], ['Meses', 'inMesesPreventa', 'Meses de preventa']] },
          B: { tarjeta: 'dCostos', nombre: 'Costos', ajustes: [['Enganche', 'inEng', 'Enganche y pagos de los clientes'], ['Obra', 'inInicioObra', 'Calendario de obra']] },
          C: { tarjeta: 'dMacro', nombre: 'Macro y crédito', ajustes: [['Capital', 'inEquity', 'Capital propio'], ['Tope', 'inMaxDeuda', 'Tope del crédito']] },
          D: { tarjeta: 'dMacro', nombre: 'Macro y crédito', ajustes: [['Reparto', 'inResidualDueno', 'Reparto con el dueño del terreno']] } }
      };
    }
  };
  function modelo(tipo, estado) {
    const f = adaptadores[tipo]; if (!f || !estado || typeof estado !== 'object') return null;
    try { return f(estado); } catch (e) { return null; }
  }

  // Lo que dice cada eslabón en una línea: la cifra del renglón cerrado y la frase que la explica.
  function lectura(m) {
    const v = m.vende, f = m.flujo, b = m.banco, q = m.queda, u = v.unidad;
    let pes = 0; for (let i = 1; i < m.meses; i++) if (f.sale[i] > f.sale[pes]) pes = i;
    return {
      A: { cifra: num(v.total) + ' ' + (v.total === 1 ? u[0] : u[1]),
        frase: ok(v.enPreventa) && ok(v.ritmo) && v.ritmo > 0 ? 'En preventa se venden ' + num(v.enPreventa, 1) + ' de ' + num(v.total) + ', a ' + num(v.ritmo, 1) + ' por mes' + (v.resto > .05 ? '; el resto, al entregar.' : '.') : 'Todo se vende al entregar.' },
      B: { cifra: 'entran ' + dinero(f.totalEntra),
        frase: 'Entra lo que pagan los clientes y sale lo que cuesta el proyecto. El mes en que más sale es el ' + (pes + 1) + ': ' + dinero(f.sale[pes]) + '.' },
      C: { cifra: b.faltaMax > 1 ? 'faltan hasta ' + dinero(b.faltaMax) : b.pico > 1 ? 'crédito hasta ' + dinero(b.pico) : 'sin crédito',
        frase: (b.capitalUsado > 1 ? 'Primero se pone el capital (' + dinero(b.capitalUsado) + '). ' : '') + (b.pico > 1 ? 'Cuando no alcanza entra el crédito: llega a ' + dinero(b.pico) + ' en el mes ' + num(b.mesPico) + (ok(b.tope) ? ', de un tope de ' + dinero(b.tope) : '') + '.' : 'No hace falta crédito.') + (b.faltaMax > 1 ? ' Aun así, en el mes ' + num(b.mesFalta) + ' llegan a faltar ' + dinero(b.faltaMax) + (b.faltante > 1 ? ' y al final siguen faltando ' + dinero(b.faltante) + '.' : '; después se cubren con lo que entra.') : '') },
      D: { cifra: dinero(q.utilidad),
        frase: ok(q.margen) && q.ventas > 0 ? 'De cada $100 que se venden ' + (q.utilidad >= 0 ? 'quedan' : 'se pierden') + ' $' + Math.abs(q.margen * 100).toFixed(2) + ', antes de impuestos.' : '' }
    };
  }

  // Notas a mano: a qué mes y a qué monto apunta cada una. El lugar donde se escriben lo busca la pantalla.
  const notas = {
    A(m, mv) {
      const v = m.vende, h = m.hitos, t = vendidas(m), out = [];
      if (ok(v.avanceAlArrancar) && h.obraDesde > 1) out.push({ id: 'a1', pr: 1, borde: h.obraDesde - 1, t: mv ? 'la obra arranca con ' + pct(v.avanceAlArrancar) + ' vendido' : 'con ' + pct(v.avanceAlArrancar) + ' vendido arranca la obra' });
      if (v.ritmo > 0 && v.mesesPreventa > 0) { const i = Math.min(v.mesesPreventa - 1, Math.round(v.mesesPreventa * .3)); out.push({ id: 'a2', pr: 2, mes: i, v: t[i], t: num(v.ritmo, 1) + ' por mes en preventa' }); }
      if (v.resto > .05) { const i = m.meses - Math.ceil(v.mesesEntrega / 2); out.push({ id: 'a3', pr: 2, mes: i, v: t[i], t: mv ? num(v.resto, 1) + ' al entregar' : 'el resto se vende al entregar: ' + num(v.resto, 1) }); }
      return out;
    },
    B(m, mv) {
      const f = m.flujo, h = m.hitos, N = m.meses, out = []; let i, ix, mx;
      ix = -1; for (i = 0; i < Math.min(N, h.preventaHasta, h.entregaDesde - 1); i++) if (f.entra[i] > 0) { ix = i; if (i >= 1) break; }
      if (ix >= 0 && ok(f.alFirmar) && f.alFirmar > 0) out.push({ id: 'b1', pr: 1, lado: 1, mes: ix, v: f.entra[ix], t: mv ? 'enganches: ' + pct(f.alFirmar) + ' al firmar' : 'enganches: ' + pct(f.alFirmar) + ' de cada venta, al firmar' });
      ix = h.entregaDesde - 1;
      if (ix >= 0 && ix < N && f.entra[ix] > 0) out.push({ id: 'b3', pr: 1, lado: 1, mes: ix, borde: ix, v: f.entra[ix] * .62, t: (mv ? 'al entregar: ' : 'al entregar se cobra el resto: ') + corto(f.entra[ix]) + ' al mes' });
      mx = 0; ix = -1; for (i = 1; i < N; i++) if (f.sale[i] > mx) { mx = f.sale[i]; ix = i; }
      if (ix >= 0) out.push({ id: 'b4', pr: 1, lado: -1, mes: ix, v: f.sale[ix] + f.interes[ix], t: 'mes ' + (ix + 1) + ', el más pesado: ' + corto(f.sale[ix]) });
      if (f.sale[0] > mx * 1.25) out.push({ id: 'b5', pr: 2, lado: -1, mes: 0, v: f.sale[0], t: mv ? 'mes 1: ' + corto(f.sale[0]) : 'mes 1, el arranque: ' + corto(f.sale[0]) });
      ix = Math.round((h.obraDesde + h.obraHasta) / 2) - 1;
      if (ok(f.enObra) && f.enObra > 0 && ix >= 0 && ix < h.entregaDesde - 1 && f.entra[ix] > 0) out.push({ id: 'b2', pr: 2, lado: 1, mes: ix, v: f.entra[ix], t: 'pagos durante la obra: ' + pct(f.enObra) });
      return out;
    },
    C(m, mv) {
      const b = m.banco, N = m.meses, out = []; let ix;
      if (b.faltaMax > 1) { ix = Math.max(0, b.mesFalta - 1); out.push({ id: 'c4', pr: 1, abajo: true, mes: ix, v: b.capital[ix] + b.credito[ix] + b.falta[ix], alerta: true, lejos: true, t: (mv ? 'aquí faltan ' : 'aquí llegan a faltar ') + corto(b.faltaMax) }); }
      if (b.pico > 1) { ix = b.credito.findIndex(x => x > b.pico * .5); if (ix < 0) ix = Math.max(0, Math.min(N - 1, nz(b.mesPico) - 1)); out.push({ id: 'c2', pr: 1, lado: -1, mes: ix, v: b.capital[ix] + b.credito[ix], t: (mv ? '2º el crédito: hasta ' : '2º entra el crédito: hasta ') + corto(b.pico) }); }
      if (b.capitalUsado > 1) { ix = Math.min(N - 1, Math.max(0, b.capital.findIndex(x => x >= b.capitalUsado - 1)) + 1); out.push({ id: 'c1', pr: 1, mes: ix, v: b.capital[ix] * .5, abajo: true, t: (mv ? '1º el capital: ' : '1º se pone el capital: ') + corto(b.capitalUsado) }); }
      if (b.caja[N - 1] > 1) out.push({ id: 'c3', pr: 1, lado: 1, mes: N - 1, v: b.caja[N - 1], t: (mv ? 'para repartir: ' : 'al final se paga todo y queda para repartir: ') + corto(b.caja[N - 1]) });
      return out;
    }
  };

  // Qué cambió entre dos lecturas, eslabón por eslabón: si se nota en la gráfica y cómo se dice.
  function cambio(a, b) {
    const dif = (x, y, rel) => ok(x) && ok(y) ? Math.abs(x - y) > Math.max(1e-9, (rel || .01) * Math.max(Math.abs(x), Math.abs(y))) : x !== y;
    const serie = (x, y) => { if (x.length !== y.length) return true; let mx = 0, dm = 0; for (let i = 0; i < x.length; i++) { mx = Math.max(mx, Math.abs(x[i]), Math.abs(y[i])); dm = Math.max(dm, Math.abs(x[i] - y[i])); } return dm > mx * .03; };
    const hitos = ['obraDesde', 'obraHasta', 'entregaDesde'].some(k => a.hitos[k] !== b.hitos[k]) || a.meses !== b.meses;
    const va = a.vende, vb = b.vende, ba = a.banco, bb = b.banco, qa = a.queda, qb = b.queda, out = {};
    out.A = { si: hitos || serie(vendidas(a), vendidas(b)),
      t: dif(va.total, vb.total) ? 'ahora son ' + num(vb.total) + ' ' + vb.unidad[1] + ' (antes ' + num(va.total) + ')'
        : dif(va.ritmo, vb.ritmo) ? 'ahora se venden ' + num(vb.ritmo, 1) + ' por mes (antes ' + num(va.ritmo, 1) + ')'
        : va.mesesPreventa !== vb.mesesPreventa ? 'la preventa dura ' + vb.mesesPreventa + ' meses (antes ' + va.mesesPreventa + ')'
        : a.hitos.obraDesde !== b.hitos.obraDesde ? 'la obra arranca en el mes ' + b.hitos.obraDesde + ' (antes en el ' + a.hitos.obraDesde + ')'
        : a.meses !== b.meses ? 'todo termina en el mes ' + b.meses + ' (antes en el ' + a.meses + ')' : '' };
    out.B = { si: hitos || serie(a.flujo.entra, b.flujo.entra) || serie(a.flujo.sale, b.flujo.sale),
      t: a.meses !== b.meses ? 'por eso el dinero termina de entrar en el mes ' + b.meses + ' (antes en el ' + a.meses + ')'
        : dif(a.flujo.totalEntra, b.flujo.totalEntra) ? 'por eso entran ' + corto(b.flujo.totalEntra) + ' (antes ' + corto(a.flujo.totalEntra) + ')'
        : dif(a.flujo.totalSale, b.flujo.totalSale) ? 'por eso salen ' + corto(b.flujo.totalSale) + ' (antes ' + corto(a.flujo.totalSale) + ')' : 'por eso el dinero se mueve en otros meses' };
    out.C = { si: hitos || serie(ba.credito, bb.credito) || serie(ba.capital, bb.capital) || serie(ba.caja, bb.caja) || serie(ba.falta, bb.falta),
      t: dif(ba.faltaMax, bb.faltaMax) && (ba.faltaMax > 1 || bb.faltaMax > 1) ? (bb.faltaMax > 1 ? 'por eso ahora llegan a faltar ' + corto(bb.faltaMax) : 'por eso ya no falta dinero')
        : dif(ba.pico, bb.pico) ? (bb.pico > 1 ? 'por eso el crédito llega a ' + corto(bb.pico) + ' (antes ' + corto(ba.pico) + ')' : 'por eso ya no hace falta crédito')
        : dif(ba.capitalUsado, bb.capitalUsado) ? 'por eso el capital es ' + corto(bb.capitalUsado) + ' (antes ' + corto(ba.capitalUsado) + ')' : 'por eso el dinero prestado se usa en otros meses' };
    out.D = { si: ['ventas', 'costo', 'financiamiento', 'utilidad'].some(k => dif(qa[k], qb[k], .0005)) || qa.socios.some((s, i) => dif(s.recibe, qb.socios[i] && qb.socios[i].recibe, .0005)),
      t: dif(qa.utilidad, qb.utilidad, .0005) ? 'y al final quedan ' + corto(qb.utilidad) + ' (antes ' + corto(qa.utilidad) + ')' : 'y al final queda lo mismo' };
    return out;
  }
  // Huella de lo que se dibuja: si no cambia, no hay nada que repintar.
  function firma(m) {
    const r = a => a.map(x => Math.round(x)).join(','), q = m.queda, b = m.banco;
    return [m.tipo, m.meses, m.hitos.obraDesde, m.hitos.obraHasta, m.hitos.entregaDesde, vendidas(m).map(x => x.toFixed(3)).join(','), r(m.flujo.entra), r(m.flujo.sale), r(b.caja), r(b.capital), r(b.credito), r(b.falta),
      [q.ventas, q.costo, q.financiamiento, q.utilidad, b.tope].map(x => Math.round(nz(x))).join(','), q.socios.map(s => Math.round(nz(s.recibe))).join(',')].join('|');
  }
  // Red de seguridad: lo que se dibuja debe sumar lo mismo que reporta el plan.
  function cuadre(m) {
    const v = m.vende, f = m.flujo, b = m.banco, q = m.queda, out = [], ver = (id, x, y, tol) => { if (ok(x) && ok(y) && Math.abs(x - y) > tol) out.push({ id, dif: x - y }); };
    ver('unidades', suma(vendidas(m)), v.total, 1e-6 * Math.max(1, nz(v.total)));
    ver('entra', suma(f.entra), f.totalEntra, 1); ver('sale', suma(f.sale), f.totalSale, 1);
    ver('capital', b.capital[b.capital.length - 1], b.capitalUsado, 1); ver('credito', maximo(b.credito), b.pico, 1);
    if (ok(q.financiamiento)) ver('utilidad', q.ventas - q.costo - q.financiamiento, q.utilidad, 1);
    return out;
  }

  const puro = { adaptadores, modelo, lectura, notas, cambio, firma, cuadre, vendidas, dinero, corto, TITULOS };
  if (typeof module === 'object' && module.exports) module.exports = puro;
  if (!root.document) return;

  /* ═════════ 2 · Pantalla ═════════ */
  const D = root.document, SVGNS = 'http://www.w3.org/2000/svg', PAN = ['A', 'B', 'C', 'D'], GRAF = ['A', 'B', 'C'];
  const el = (tag, cls, txt) => { const e = D.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const sv = (padre, tag, cls) => { const e = D.createElementNS(SVGNS, tag); if (cls) e.setAttribute('class', cls); padre.appendChild(e); return e; };
  // Consultas de pantalla en caché: leer el ancho de la ventana en cada tecla obliga a reacomodar la página.
  const mq = q => { const m = root.matchMedia ? root.matchMedia(q) : null; return () => !!(m && m.matches); };
  const reducido = mq('(prefers-reduced-motion: reduce)'), movil = mq('(max-width: 759.98px)');
  const n1 = x => Math.round(x * 10) / 10;

  let nd = null;            // nodos de la pantalla
  let S = null;             // lo último recibido: {m, f, clave, version, tipo}
  let ctx = {};             // contexto del tablero anfitrión
  const visto = {}, fant = {};   // qué lectura enseña cada eslabón y cuál era la de «antes»
  let abierto = 'A', enVista = true, pendiente = false, ultima = null, propio = 0;
  const cadena = { activa: false, sigue: false, timers: [], destino: null, desde: null, tFant: 0 }, rafaga = { t: 0, antes: null };

  function montar(ancla) {
    const raiz = el('section', 'cad'); raiz.id = 'pppCadena'; raiz.setAttribute('aria-label', 'Diagrama del plan: de la venta a lo que queda');
    const top = el('div', 'cad-top'), tit = el('div');
    tit.append(el('span', 'cad-kicker', 'Diagrama del plan'), el('h2', '', 'De la venta a lo que queda'));
    const ver = el('span', 'cad-version'); top.append(tit, ver);
    const riel = el('div', 'cad-riel');
    nd = { raiz, ver, riel, por: {} };
    PAN.forEach((k, n) => {
      const pan = el('article', 'cad-pan'); pan.dataset.k = k;
      const cab = el('button', 'cad-cab'); cab.type = 'button'; cab.id = 'cadCab' + k; cab.setAttribute('aria-controls', 'cadCuerpo' + k);
      const nom = el('span', 'cad-nom', TITULOS[k]), cifra = el('span', 'cad-cifra'), chev = el('span', 'cad-chev', '⌄'); chev.setAttribute('aria-hidden', 'true');
      cab.append(el('span', 'cad-num', String(n + 1)), nom, cifra, chev);
      const cuerpo = el('div', 'cad-cuerpo'); cuerpo.id = 'cadCuerpo' + k; cuerpo.setAttribute('role', 'region'); cuerpo.setAttribute('aria-labelledby', cab.id);
      const frase = el('p', 'cad-frase'), dijo = el('p', 'cad-dijo'); dijo.hidden = true;
      const o = nd[k] = { pan, cab, nom, cifra, cuerpo, frase, dijo, notas: {}, barras: [], tok: 0, g: null };
      cuerpo.append(frase, dijo);
      if (k !== 'D') {
        o.ley = el('div', 'cad-ley'); o.plot = el('div', 'cad-plot'); o.plot.setAttribute('role', 'img'); o.ejes = el('div', 'cad-ejes'); o.ejes.setAttribute('aria-hidden', 'true');
        o.obra = el('div', 'cad-obra'); o.raya = el('div', 'cad-raya'); o.plot.append(o.obra, o.raya);
        if (k !== 'A') { o.cero = el('div', 'cad-cero'); o.plot.append(o.cero); }
        if (k === 'C') { o.tope = el('div', 'cad-tope'); o.tope.append(el('span')); o.plot.append(o.tope); }
        o.svg = sv(o.plot, 'svg', 'cad-tinta'); o.svg.setAttribute('aria-hidden', 'true'); o.gh = sv(o.svg, 'path', 'cad-antes');
        o.cur = el('div', 'cad-cursor'); o.tip = el('div', 'cad-tip'); o.plot.append(o.cur, o.tip);
        cuerpo.append(o.ley, o.plot, o.ejes);
        if (k === 'A') { o.prod = el('div', 'cad-prod'); o.prodT = el('p'); o.prodBar = el('div', 'cad-prod-bar'); o.prodBar.setAttribute('role', 'img'); o.prodLey = el('div', 'cad-ley'); o.prod.append(o.prodT, o.prodBar, o.prodLey); cuerpo.append(o.prod); }
      } else {
        o.cuenta = el('div', 'cad-cuenta'); o.fila = {};
        [['ventas', 'Se vende', ''], ['costo', 'Cuesta el proyecto', '−'], ['fin', 'Cuesta el dinero prestado', '−'], ['util', 'Queda', '=']].forEach(([id, nombre, signo]) => {
          const f = el('div', 'cad-fila cad-fila-' + id), v = el('strong'), d = el('em'); f.append(el('span', 'cad-signo', signo), el('span', 'cad-concepto', nombre), d, v); o.fila[id] = { v, d }; o.cuenta.append(f);
        });
        o.tira = el('div', 'cad-tira'); o.tira.setAttribute('role', 'img'); o.seg = ['costo', 'fin', 'util'].map(id => { const s = el('i', 'cad-seg-' + id); o.tira.append(s); return s; });
        o.tiraLey = el('div', 'cad-ley');
        o.nota = el('p', 'cad-aviso'); o.nota.hidden = true;
        o.rango = el('div', 'cad-rango'); o.rango.hidden = true; o.rangoT = el('p'); o.rangoRiel = el('div', 'cad-rango-riel'); o.rango.append(o.rangoT, o.rangoRiel);
        o.socios = el('div', 'cad-socios'); o.sociosT = el('p', 'cad-socios-t', 'Así se reparte'); o.sociosBar = el('div', 'cad-socios-bar'); o.sociosBar.setAttribute('role', 'img'); o.sociosLey = el('div', 'cad-socios-ley');
        o.socios.append(o.sociosT, o.sociosBar, o.sociosLey);
        cuerpo.append(o.cuenta, o.tira, o.tiraLey, o.nota, o.rango, o.socios);
      }
      o.pie = el('div', 'cad-pie'); cuerpo.append(o.pie);
      pan.append(cab, cuerpo);
      cab.addEventListener('click', () => { if (!movil()) return; parar(); abierto = abierto === k ? null : k; acordeon(); });
      const por = el('div', 'cad-por'); por.setAttribute('aria-hidden', 'true'); const s = sv(por, 'svg'); s.setAttribute('viewBox', '0 0 34 26'); sv(s, 'path').setAttribute('d', 'M2 13C12 9 16 17 27 13M21 6l8 7-8 7'); s.firstChild.setAttribute('pathLength', '1'); por.append(el('span', '', POR_ESO[k])); nd.por[k] = por; pan.prepend(por);
      riel.append(pan);
    });
    const barra = el('div', 'cad-barra'), dock = el('div', 'cad-dock'); nd.dock = dock;
    nd.vers = el('div', 'cad-vers'); nd.vers.setAttribute('role', 'group'); nd.vers.setAttribute('aria-label', 'Versiones de este plan');
    nd.rep = el('button', 'cad-rep', 'Repetir despacio'); nd.rep.type = 'button'; nd.rep.hidden = true; nd.rep.addEventListener('click', repetir);
    nd.una = el('p', 'cad-una'); nd.una.hidden = true;
    barra.append(nd.vers, nd.rep); dock.append(nd.una);
    nd.fuente = el('p', 'cad-fuente'); nd.fuenteT = el('span'); nd.tabla = el('button', 'cad-tabla', 'Ver la tabla mes a mes ↓'); nd.tabla.type = 'button'; nd.tabla.addEventListener('click', () => { if (ctx.verTabla) ctx.verTabla(); }); nd.fuente.append(nd.fuenteT, nd.tabla);
    raiz.append(top, barra, riel, dock, nd.fuente);
    if (ancla && ancla.parentNode) ancla.after(raiz); else (D.querySelector('main') || D.body).prepend(raiz);
    iniciarCursor();
    raiz.addEventListener('pointerdown', e => { if (cadena.activa && !e.target.closest('.cad-barra')) parar(); });
    if (root.IntersectionObserver) new IntersectionObserver(es => { enVista = es[es.length - 1].isIntersecting; if (enVista && pendiente) alVolver(); }, { threshold: .35 }).observe(riel);
    // Si cambia el tamaño de una gráfica (giro, ancho, fila más alta) se reacomodan sus barras y notas.
    if (root.ResizeObserver) {
      let tR = 0; const tam = {};
      const ro = new ResizeObserver(es => {
        let cambio = false; es.forEach(e => { const k = e.target.dataset.cad, t = Math.round(e.contentRect.width) + 'x' + Math.round(e.contentRect.height); nd[k].W = e.contentRect.width; if (tam[k] !== t) { if (tam[k] !== undefined && e.contentRect.width > 0) cambio = true; tam[k] = t; } });
        if (!cambio) return; clearTimeout(tR);
        tR = setTimeout(() => { if (!S || cadena.activa) return; acordeon(); GRAF.forEach(k => { if (visto[k] && !nd[k].cuerpo.hidden) { pintarGraf(k, visto[k]); anotar(k, false); } }); if (visto.D && !nd.D.cuerpo.hidden) pintarD(visto.D, false, null, true); }, 120);
      });
      GRAF.forEach(k => { nd[k].plot.dataset.cad = k; ro.observe(nd[k].plot); }); nd.D.tira.dataset.cad = 'D'; ro.observe(nd.D.tira);
    }
    if (D.fonts && D.fonts.load) D.fonts.load('700 20px Caveat').then(() => { if (S && !cadena.activa) GRAF.forEach(k => anotar(k, false)); }, () => {});
  }

  // En el teléfono los eslabones son un acordeón; en pantalla ancha se ven los cuatro.
  function acordeon() {
    const mv = movil();
    PAN.forEach(k => {
      const o = nd[k], on = !mv || abierto === k, antes = !o.cuerpo.hidden;
      o.cuerpo.hidden = !on; o.cab.setAttribute('aria-expanded', String(on)); o.pan.classList.toggle('cad-abierto', on);
      o.cab.tabIndex = mv ? 0 : -1;
      if (on && !antes && visto[k]) { if (k === 'D') pintarD(visto.D, false, null, true); else { pintarGraf(k, visto[k]); anotar(k, false); } }
    });
  }

  /* ───────── gráficas ───────── */
  function barras(o, N, clases) {
    for (let i = o.barras.length; i < N; i++) { const b = {}; clases.forEach(c => { b[c] = el('div', 'cad-b cad-b-' + c); o.plot.insertBefore(b[c], o.svg); }); o.barras.push(b); }
    o.barras.forEach((b, i) => { for (const c in b) b[c].hidden = i >= N; });
    if (!(o.W > 0) && !o.cuerpo.hidden) o.W = o.plot.clientWidth; const cw = (o.W || 300) / N; o.hueco = cw >= 7 ? 2 : cw >= 3.5 ? 1 : 0;
  }
  function geo(e, i, N, hueco, desde, alto, abajo) {
    e.style.left = 'calc(' + (i / N * 100) + '% + ' + (hueco / 2) + 'px)'; e.style.width = 'calc(' + (100 / N) + '% - ' + hueco + 'px)';
    if (abajo) { e.style.top = desde + '%'; e.style.bottom = ''; } else { e.style.bottom = desde + '%'; e.style.top = ''; }
    alto = alto > 0 ? alto : 0; e.style.height = alto + '%'; e.style.opacity = alto > 0 ? '' : '0';
  }
  function fases(o, m) {
    const N = m.meses, h = m.hitos, a = Math.min(N, h.obraDesde - 1), b = Math.min(N, h.obraHasta);
    o.obra.style.left = (a / N * 100) + '%'; o.obra.style.width = (Math.max(0, b - a) / N * 100) + '%';
    o.raya.style.left = ((h.entregaDesde - 1) / N * 100) + '%';
    let ej = '<span style="left:0">mes 1</span>'; const paso = N <= 30 ? 6 : N <= 72 ? 12 : 24;
    for (let x = paso; x <= N; x += paso) ej += '<span style="left:' + ((x - .5) / N * 100) + '%">' + x + '</span>';
    if (o.ejesN !== N) { o.ejesN = N; o.ejes.innerHTML = ej; }
  }
  const PINTA = {
    A(m, o) {
      const N = m.meses, t = vendidas(m), mx = maximo(t), u = mx > 0 ? 56 / mx : 0, s = m.vende.series; o.g = { cero: 1, u };
      barras(o, N, ['pre', 'ent']);
      for (let i = 0; i < N; i++) { const h0 = s[0].porMes[i] * u; geo(o.barras[i].pre, i, N, o.hueco, 0, h0); geo(o.barras[i].ent, i, N, o.hueco, h0, s[1].porMes[i] * u); }
    },
    B(m, o) {
      const N = m.meses, f = m.flujo, up = maximo(f.entra), dn = maximo(f.sale.map((x, i) => x + f.interes[i])), u = Math.min(up > 0 ? 54 / up : Infinity, dn > 0 ? 36 / dn : Infinity); o.g = { cero: .6, u: Number.isFinite(u) ? u : 0 };
      barras(o, N, ['entra', 'sale', 'interes']); o.cero.style.top = '60%';
      for (let i = 0; i < N; i++) { const b = o.barras[i], hs = f.sale[i] * o.g.u; geo(b.entra, i, N, o.hueco, 40, f.entra[i] * o.g.u); geo(b.sale, i, N, o.hueco, 60, hs, true); geo(b.interes, i, N, o.hueco, 60 + hs, f.interes[i] * o.g.u, true); }
    },
    C(m, o) {
      const N = m.meses, b = m.banco, up = maximo(b.caja), dn = maximo(b.capital.map((x, i) => x + b.credito[i] + b.falta[i])), u = Math.min(up > 0 ? 24 / up : Infinity, dn > 0 ? 60 / dn : Infinity); o.g = { cero: .32, u: Number.isFinite(u) ? u : 0 };
      barras(o, N, ['caja', 'capital', 'credito', 'falta']); o.cero.style.top = '32%';
      for (let i = 0; i < N; i++) { const q = o.barras[i], hc = b.capital[i] * o.g.u, hd = b.credito[i] * o.g.u; geo(q.caja, i, N, o.hueco, 68, Math.max(0, b.caja[i]) * o.g.u); geo(q.capital, i, N, o.hueco, 32, hc, true); geo(q.credito, i, N, o.hueco, 32 + hc, hd, true); geo(q.falta, i, N, o.hueco, 32 + hc + hd, b.falta[i] * o.g.u, true); }
      // El tope del crédito se dibuja sobre el capital ya puesto, que es donde empieza a contar.
      const y = ok(b.tope) && b.tope > 0 && b.pico > 1 ? 32 + (maximo(b.capital) + b.tope) * o.g.u : 200;
      o.tope.hidden = y > 97; o.tope.style.top = y + '%'; o.tope.firstChild.textContent = 'tope del crédito ' + corto(b.tope); o.tope.classList.toggle('cad-izq', nz(b.mesPico) > N / 2);
    }
  };
  // De dónde salen las ventas: participación de cada producto, del mismo estado.
  function productos(m) {
    const o = nd.A, v = m.vende, ps = (v.productos || []).filter(x => ok(x.monto) && x.monto > 0), tot = suma(ps.map(x => x.monto)), huella = ps.map(x => x.nombre + Math.round(x.monto)).join('|');
    o.prod.hidden = !ps.length || !(tot > 0); if (o.prod.hidden || o.prodH === huella) return; o.prodH = huella;
    o.prodT.textContent = 'De dónde salen los ' + dinero(v.ventas); o.prodBar.textContent = ''; o.prodLey.textContent = '';
    ps.forEach(x => { const i = (v.productos || []).indexOf(x), b = el('i', 'cad-p' + i); b.style.flexGrow = String(x.monto); if (x.monto / tot >= .12) b.textContent = pct(x.monto / tot); o.prodBar.append(b); const e = el('span'); e.append(el('i', 'cad-p' + i), x.nombre + ' ', el('b', '', dinero(x.monto))); o.prodLey.append(e); });
    o.prodBar.setAttribute('aria-label', ps.map(x => x.nombre + ': ' + pct(x.monto / tot)).join('; '));
  }
  function pintarGraf(k, m, l) { const o = nd[k]; PINTA[k](m, o); fases(o, m); if (k === 'A') productos(m); o.plot.setAttribute('aria-label', TITULOS[k] + '. ' + (l || lectura(m))[k].frase); leyenda(k, m); }
  const sq = (c, txt) => '<span><i class="cad-c-' + c + '"></i>' + txt + '</span>';
  function leyenda(k, m) {
    const o = nd[k], b = m.banco, tiempo = sq('obra', 'obra') + sq('raya', 'inicia la entrega') + '<span class="cad-ley-antes"><i class="cad-c-antes"></i>antes</span>';
    const h = k === 'A' ? m.vende.series.map((x, i) => (maximo(x.porMes) > 0 ? sq(i ? 'ent' : 'pre', x.nombre) : '')).join('') + tiempo
      : k === 'B' ? sq('entra', 'Entra') + sq('sale', 'Sale') + (maximo(m.flujo.interes) > 1 ? sq('interes', 'Interés que se paga') : '') + tiempo
        : sq('caja', 'En el banco') + sq('capital', 'Capital puesto') + sq('credito', 'Crédito') + (b.faltaMax > 1 ? sq('falta', 'Falta') : '') + tiempo;
    if (o.leyH !== h) { o.leyH = h; o.ley.innerHTML = h; }
  }
  // Silueta de cada gráfica en pixeles: dice dónde hay espacio libre y dibuja la línea de «antes».
  const SIL = {
    A: (m, o, H) => { const u = o.g.u * H / 100; return [vendidas(m).map(x => H - x * u)]; },
    B: (m, o, H) => { const z = o.g.cero * H, u = o.g.u * H / 100, f = m.flujo; return [f.entra.map(x => z - x * u), f.sale.map((x, i) => z + (x + f.interes[i]) * u)]; },
    C: (m, o, H) => { const z = o.g.cero * H, u = o.g.u * H / 100, b = m.banco; return [b.caja.map(x => z - Math.max(0, x) * u), b.capital.map((x, i) => z + (x + b.credito[i] + b.falta[i]) * u)]; }
  };

  /* ───────── notas a mano ───────── */
  function buscar(W, H, w, h, sp, oc, puestos, flechas, md, puntos) {
    let best = null, bs = 1e9; const cw = oc.cw, n = oc.col.length, mg = 3, tx = sp.x, ty = sp.y, maxD = md.maxD * (sp.lejos ? 2.6 : 1);
    for (let y = 1; y <= H - h - 1; y += 3) for (let x = 1; x <= W - w - 1; x += 4) {
      const px = tx < x ? x : tx > x + w ? x + w : tx, py = ty < y ? y : ty > y + h ? y + h : ty, dx = tx - px, dy = ty - py, d = Math.sqrt(dx * dx + dy * dy);
      if (d < md.minD || d > maxD * 1.25) continue;
      let s = Math.abs(d - md.ideal) * (sp.lejos ? .35 : 1) + (d > maxD ? (d - maxD) * 2 : 0);
      if (sp.lado && md.z != null && ((y + h / 2 < md.z) !== (sp.lado > 0))) s += 45;     // del mismo lado de la raya de cero que lo que señala
      if (x < md.xr + 4 && x + w > md.xr - 4) s += 16;                                     // sin encimarse en la raya de entrega
      if (x < md.xo + 4 && x + w > md.xo - 4) s += 12;                                     // ni en el arranque de la obra
      if (s >= bs) continue;
      const i0 = Math.max(0, Math.floor((x - mg) / cw)), i1 = Math.min(n - 1, Math.floor((x + w + mg) / cw)); let libre = true, i, k, q, t, ax, ay, c;
      for (i = i0; i <= i1; i++) { c = oc.col[i]; if (y + h + mg > c[0] && y - mg < c[1]) { libre = false; break; } }
      if (!libre) continue;
      for (k = 0; k < puestos.length; k++) { q = puestos[k]; if (x < q.x + q.w + 8 && x + w + 8 > q.x && y < q.y + q.h + 5 && y + h + 5 > q.y) { libre = false; break; } }
      if (!libre) continue;
      for (k = 0; k < puntos.length; k++) { q = puntos[k]; if (q !== sp && q.x > x - 7 && q.x < x + w + 7 && q.y > y - 7 && q.y < y + h + 7) { libre = false; break; } }   // no tapar lo que señala otra nota
      if (!libre) continue;
      for (k = 0; k < flechas.length && libre; k++) { q = flechas[k]; for (t = .08; t < 1; t += .13) { ax = q.x0 + (q.x1 - q.x0) * t; ay = q.y0 + (q.y1 - q.y0) * t; if (ax > x - 4 && ax < x + w + 4 && ay > y - 4 && ay < y + h + 4) { libre = false; break; } } }
      if (!libre) continue;
      for (t = .2; t < .95 && libre; t += .18) {
        ax = px + dx * t; ay = py + dy * t;
        for (k = 0; k < puestos.length; k++) { q = puestos[k]; if (ax > q.x - 4 && ax < q.x + q.w + 4 && ay > q.y - 4 && ay < q.y + q.h + 4) { libre = false; break; } }
        if (libre && t < .7) { c = oc.col[Math.max(0, Math.min(n - 1, Math.floor(ax / cw)))]; if (ay > c[0] + 3 && ay < c[1] - 3) s += 9; }
      }
      if (!libre || s >= bs) continue;
      bs = s; best = { x, y, w, h, px, py, d, s };
    }
    return best;
  }
  function medir(e, mw) {
    e.style.width = ''; e.style.maxWidth = mw + 'px';
    let w = Math.ceil(e.getBoundingClientRect().width); const h = e.offsetHeight;
    if (w >= mw - 1) { let lo = Math.ceil(w * .4), hi = w, mid; while (hi - lo > 2) { mid = (lo + hi) >> 1; e.style.width = mid + 'px'; if (e.offsetHeight > h) lo = mid; else hi = mid; } w = hi; }   // el texto dio vuelta: la caja se ajusta a los renglones
    e.style.width = (w + 1) + 'px'; e.style.maxWidth = 'none';
    return { w: w + 1, h };
  }
  function trazo(x0, y0, x1, y1, idx) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L, bow = Math.max(3, Math.min(13, L * .17)) * (idx % 2 ? 1 : -1);
    const cx = (x0 + x1) / 2 + nx * bow, cy = (y0 + y1) / 2 + ny * bow, ang = Math.atan2(y1 - cy, x1 - cx), hd = Math.max(5, Math.min(9, L * .34)), a1 = ang + Math.PI - .5, a2 = ang + Math.PI + .5;
    return 'M' + n1(x0) + ' ' + n1(y0) + 'Q' + n1(cx) + ' ' + n1(cy) + ' ' + n1(x1) + ' ' + n1(y1) + 'M' + n1(x1 + Math.cos(a1) * hd) + ' ' + n1(y1 + Math.sin(a1) * hd) + 'L' + n1(x1) + ' ' + n1(y1) + 'L' + n1(x1 + Math.cos(a2) * hd) + ' ' + n1(y1 + Math.sin(a2) * hd);
  }
  function ocultarNota(nt) { nt.el.classList.remove('on'); nt.fl.setAttribute('d', ''); nt.halo.setAttribute('d', ''); }
  // De (mes, monto) a pixeles dentro de la gráfica.
  function aPixeles(k, sp, o, W, H, N, sil) {
    const cw = W / N, z = o.g.cero * H, u = o.g.u * H / 100;
    if (k === 'A' && sp.borde != null) { let top = 0; for (let i = Math.max(0, sp.borde - 2); i <= Math.min(N - 1, sp.borde + 1); i++) top = Math.max(top, H - sil[0][i]); return { x: sp.borde * cw, y: Math.max(8, (H - top) * .5) }; }
    const x = sp.borde != null ? sp.borde * cw + 2 : (sp.mes + .5) * cw;
    return { x, y: k === 'A' ? H - sp.v * u : sp.lado > 0 && !sp.abajo ? z - sp.v * u : z + sp.v * u };
  }
  function fantasma(k, sil, W, H) {
    const o = nd[k], previo = fant[k];
    if (!previo) { o.gh.setAttribute('d', ''); o.pan.classList.remove('cad-con-antes'); return null; }
    const N = visto[k].meses, cw = W / N, viejo = SIL[k](previo, o, H); let d = '', mayor = null, fuera = null;
    for (let s = 0; s < sil.length; s++) {
      let pluma = false, ly = 0; const base = k === 'A' ? H : o.g.cero * H;
      for (let i = 0; i < N; i++) {
        const y0 = i < viejo[s].length ? viejo[s][i] : base, dif = Math.abs(y0 - sil[s][i]);
        if (dif > 1.2) {
          if (!pluma) d += 'M' + n1(i * cw) + ' ' + n1(y0); else if (Math.abs(ly - y0) > .05) d += 'V' + n1(y0);
          d += 'H' + n1((i + 1) * cw); pluma = true; ly = y0;
          if (!mayor || dif > mayor.dif) mayor = { dif, x: (i + .5) * cw, y: y0 };
          if ((s === 0 ? y0 < sil[s][i] : y0 > sil[s][i]) && (!fuera || dif > fuera.dif)) fuera = { dif, x: (i + .5) * cw, y: y0, lado: k === 'A' ? 0 : s === 0 ? 1 : -1 };   // fuera de las barras de ahora se ve mejor
        } else pluma = false;
      }
    }
    o.gh.setAttribute('d', d); o.gh.style.opacity = ''; o.pan.classList.toggle('cad-con-antes', d !== '');
    return fuera && fuera.dif > 5 ? fuera : mayor;
  }
  function anotar(k, dibuja) {
    const o = nd[k], m = visto[k]; if (!m || !o.g || o.cuerpo.hidden) return;
    const W = o.plot.clientWidth, H = o.plot.clientHeight; if (!W || !H) return;
    const N = m.meses, mv = W < 520, cw = W / N, sil = SIL[k](m, o, H), tok = ++o.tok;
    const md = { minD: 15, ideal: mv ? 28 : 40, maxD: mv ? 86 : 124, z: k === 'A' ? null : o.g.cero * H, xr: (m.hitos.entregaDesde - 1) * cw, xo: (m.hitos.obraDesde - 1) * cw }, mw = mv ? 132 : 184;
    const oc = { cw, col: sil[0].map((y, i) => (k === 'A' ? [y - 3, H + 2] : [y - 3, sil[1][i] + 3])) }, puestos = [], flechas = [], usados = {};
    if (k === 'C' && !o.tope.hidden) { const r = o.tope.firstChild.getBoundingClientRect(), p = o.plot.getBoundingClientRect(); puestos.push({ x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height }); }
    const specs = notas[k](m, mv).filter(sp => !mv || sp.pr <= 2 || W >= 400);
    specs.forEach(sp => Object.assign(sp, aPixeles(k, sp, o, W, H, N, sil)));
    const mayor = fantasma(k, sil, W, H);
    if (mayor && mayor.dif > 5 && !mv) specs.push({ id: 'ant', pr: 4, x: mayor.x, y: mayor.y, lado: mayor.lado || 0, t: 'antes' });
    const vivos = specs.filter(sp => sp.x >= 0 && sp.x <= W && sp.y >= -2 && sp.y <= H + 2).sort((a, b) => a.pr - b.pr);
    vivos.forEach((sp, idx) => {
      let nt = o.notas[sp.id], best = null;
      if (!nt) { nt = o.notas[sp.id] = { halo: sv(o.svg, 'path', 'cad-halo'), fl: sv(o.svg, 'path', 'cad-fl'), el: el('div', 'cad-nota') }; nt.fl.setAttribute('pathLength', '1'); o.plot.insertBefore(nt.el, o.cur); }
      nt.el.style.left = '0px'; nt.el.style.top = '0px'; nt.el.style.transform = 'none'; nt.el.textContent = sp.t; nt.el.classList.toggle('cad-alerta', !!sp.alerta); nt.fl.classList.toggle('cad-alerta', !!sp.alerta);
      [mw, Math.round(mw * .72)].forEach((w0, wi) => { const sz = medir(nt.el, w0), b = buscar(W, H, sz.w, sz.h, sp, oc, puestos, flechas, md, vivos); if (b) { b.s += wi * 5; b.w0 = w0; if (!best || b.s < best.s) best = b; } });
      if (!best) { ocultarNota(nt); return; }
      usados[sp.id] = 1; medir(nt.el, best.w0);
      nt.el.style.left = best.x + 'px'; nt.el.style.top = best.y + 'px';
      nt.el.style.textAlign = sp.x > best.x + best.w ? 'right' : sp.x < best.x ? 'left' : 'center';
      nt.el.style.transform = 'rotate(' + (idx % 2 ? 1.2 : -1.4) + 'deg)';
      puestos.push(best);
      const ux = (sp.x - best.px) / best.d, uy = (sp.y - best.py) / best.d, x0 = best.px + ux * 3, y0 = best.py + uy * 3, x1 = sp.x - ux * 1.5, y1 = sp.y - uy * 1.5, d = trazo(x0, y0, x1, y1, idx);
      flechas.push({ x0, y0, x1, y1 });
      nt.halo.setAttribute('d', d); nt.fl.setAttribute('d', d);
      if (dibuja && !reducido()) {
        nt.el.classList.remove('on'); nt.halo.style.opacity = '0'; nt.fl.style.transition = 'none'; nt.fl.style.strokeDashoffset = '1';
        setTimeout(() => { if (o.tok !== tok) return; nt.el.classList.add('on'); nt.halo.style.opacity = ''; nt.fl.style.transition = 'stroke-dashoffset .45s ease-out, opacity .3s'; nt.fl.style.strokeDashoffset = '0'; }, 40 + idx * 140);
      } else { nt.el.classList.add('on'); nt.halo.style.opacity = ''; nt.fl.style.transition = ''; nt.fl.style.strokeDashoffset = '0'; }
    });
    for (const id in o.notas) if (!usados[id]) ocultarNota(o.notas[id]);
  }

  /* ───────── el mes bajo el dedo ───────── */
  let cursorMes = null;
  const TIP = {
    A: (m, i) => { const t = vendidas(m); let ac = 0; for (let q = 0; q <= i; q++) ac += t[q]; return 'se venden ' + num(t[i], 1) + ' · van ' + num(ac, 1) + ' de ' + num(m.vende.total); },
    B: (m, i) => 'entra ' + corto(m.flujo.entra[i]) + ' · sale ' + corto(m.flujo.sale[i] + m.flujo.interes[i]),
    C: (m, i) => { const b = m.banco; return 'en el banco ' + corto(Math.max(0, b.caja[i])) + ' · capital ' + corto(b.capital[i]) + ' · crédito ' + corto(b.credito[i]) + (b.falta[i] > 1 ? ' · falta ' + corto(b.falta[i]) : ''); }
  };
  function ponerCursor(i) {
    if (cadena.activa || i === cursorMes) return;
    cursorMes = i; nd.raiz.classList.add('cad-con-cursor');
    GRAF.forEach(k => {
      const o = nd[k], m = visto[k]; if (!m || o.cuerpo.hidden) return; const N = m.meses, j = Math.min(N - 1, i);
      o.cur.style.left = (j / N * 100) + '%'; o.cur.style.width = (100 / N) + '%';
      o.tip.textContent = ''; o.tip.append(el('b', '', 'Mes ' + (j + 1)), ' · ' + TIP[k](m, j));
      const W = o.plot.clientWidth, tw = o.tip.offsetWidth; o.tip.style.left = Math.max(0, Math.min(W - tw, (j + .5) / N * W - tw / 2)) + 'px';
    });
  }
  function limpiarCursor() { if (cursorMes === null) return; cursorMes = null; nd.raiz.classList.remove('cad-con-cursor'); }
  function iniciarCursor() {
    GRAF.forEach(k => {
      const p = nd[k].plot, idx = ev => { const rc = p.getBoundingClientRect(), N = visto[k] ? visto[k].meses : 1; return Math.max(0, Math.min(N - 1, Math.floor((ev.clientX - rc.left) / rc.width * N))); };
      p.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse' || ev.buttons) ponerCursor(idx(ev)); });
      p.addEventListener('pointerdown', ev => { const i = idx(ev); if (ev.pointerType !== 'mouse' && i === cursorMes) limpiarCursor(); else ponerCursor(i); });
      p.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') limpiarCursor(); });
      p.addEventListener('pointercancel', limpiarCursor);
    });
    D.addEventListener('pointerdown', ev => { if (cursorMes !== null && !(ev.target.closest && ev.target.closest('.cad-plot'))) limpiarCursor(); });
  }

  /* ───────── lo que queda ───────── */
  function contar(e, a, fn, dur) {
    const de = typeof e._v === 'number' ? e._v : a; e._v = a;
    if (e._raf) cancelAnimationFrame(e._raf);
    if (!dur || !ok(a) || !ok(de) || Math.abs(de - a) < 1e-9) { e.textContent = fn(a); return; }
    let t0 = null; const paso = ahora => { if (t0 === null) t0 = ahora; const p = Math.min(1, (ahora - t0) / dur), q = 1 - Math.pow(1 - p, 3); e.textContent = fn(de + (a - de) * q); e._raf = p < 1 ? requestAnimationFrame(paso) : 0; };
    e._raf = requestAnimationFrame(paso);
  }
  function pintarD(m, anim, previo, conserva) {
    const o = nd.D, q = m.queda, d = anim && !reducido() ? 900 : 0, p = previo ? previo.queda : null, fin = q.financiamiento;
    const fila = (id, v, v0) => { contar(o.fila[id].v, v, dinero, d); if (conserva) return; const x = ok(v) && ok(v0) ? v - v0 : 0; o.fila[id].d.textContent = Math.abs(x) >= 5e4 ? (x > 0 ? '+' : '−') + (Math.abs(x) / 1e6).toFixed(1) : ''; };
    fila('ventas', q.ventas, p && p.ventas); fila('costo', q.costo, p && p.costo); fila('fin', fin, p && p.financiamiento); fila('util', q.utilidad, p && p.utilidad);
    o.pan.classList.toggle('cad-pierde', q.utilidad < 0);
    // La tira: de lo que se vende, cuánto se va en cada cosa. Sólo proporciones del mismo estado.
    const partes = [q.costo, fin, Math.max(0, q.utilidad)].map(x => Math.max(0, nz(x))), tot = suma(partes), W = o.W > 0 ? o.W : o.cuerpo.hidden ? 300 : (o.W = o.tira.clientWidth) || 300;
    o.seg.forEach((s, i) => { s.style.display = partes[i] > 0 ? '' : 'none'; s.style.flexGrow = String(partes[i]); s.textContent = tot > 0 && q.ventas > 0 && W * partes[i] / tot >= 40 ? pct(partes[i] / q.ventas) : ''; });
    o.tira.setAttribute('aria-label', 'De lo que se vende: ' + pct(q.costo / q.ventas) + ' cuesta el proyecto, ' + pct(nz(fin) / q.ventas) + ' cuesta el dinero prestado y ' + pct(q.utilidad / q.ventas, 1) + ' queda.');
    o.tiraLey.innerHTML = sq('rojo', 'Proyecto') + sq('morado', 'Dinero prestado') + sq('oro', 'Queda');
    const dif = ok(fin) ? q.ventas - q.costo - fin - q.utilidad : 0;
    o.nota.hidden = Math.abs(dif) <= 1; if (!o.nota.hidden) o.nota.textContent = 'El plan reporta ' + dinero(Math.abs(dif)) + ' de diferencia entre estas cuatro cifras: revisarla abajo.';
    pintarRango();
    // Reparto: mismas dos barras que el tablero (parte positiva de la ganancia de cada socio).
    const g = q.socios.map(s => Math.max(0, nz(s.gana))), tg = suma(g);
    o.sociosBar.textContent = ''; o.sociosLey.textContent = '';
    q.socios.forEach((s, i) => {
      const b = el('i', 'cad-soc-' + s.id); b.style.flexGrow = String(tg > 0 ? g[i] : 1); o.sociosBar.append(b);
      const l = el('span'); l.append(el('i', 'cad-soc-' + s.id), s.nombre + ' recibe ', el('b', '', dinero(s.recibe))); if (s.id === 'desarrollador' && ok(q.tir)) l.append(' · rinde ', el('b', '', pct(q.tir, 1)), ' al año (TIR)'); o.sociosLey.append(l);
    });
    o.sociosBar.setAttribute('aria-label', q.socios.map((s, i) => s.nombre + ': ' + (tg > 0 ? pct(g[i] / tg) : '—') + ' de la ganancia').join('; '));
  }

  // Entre las versiones guardadas del mismo plan: de cuánto a cuánto queda.
  function pintarRango() {
    const o = nd.D, vs = (S && S.rango) || null;
    o.rango.hidden = !vs; if (!vs) return;
    const igual = vs.hi - vs.lo < 5e4;
    o.rangoT.textContent = igual ? 'Tus ' + vs.pts.length + ' versiones dejan lo mismo.' : 'Entre tus ' + vs.pts.length + ' versiones queda de ' + corto(vs.lo) + ' a ' + corto(vs.hi) + '.';
    o.rangoRiel.textContent = '';
    vs.pts.forEach(pt => { const i = el('i'); i.style.left = (igual ? 50 : (pt.u - vs.lo) / (vs.hi - vs.lo) * 100) + '%'; i.classList.toggle('cad-act', pt.activa); i.title = pt.nombre + ': ' + dinero(pt.u); o.rangoRiel.append(i); });
  }

  /* ───────── poner una lectura en pantalla ───────── */
  function textos(k, m, previo, anim, lec, cam) {
    const o = nd[k], l = (lec || lectura(m))[k], c = previo ? (cam || cambio(previo, m))[k] : null;
    o.cifra.textContent = l.cifra; o.frase.textContent = l.frase; o.frase.hidden = !l.frase;
    o.dijo.hidden = !(c && c.si && c.t); o.dijo.textContent = o.dijo.hidden ? '' : c.t;
    if (!o.dijo.hidden && anim && !reducido()) { o.dijo.classList.remove('cad-escribe'); void o.dijo.offsetWidth; o.dijo.classList.add('cad-escribe'); }
    pie(k, m);
  }
  function pie(k, m) {
    const o = nd[k], f = m.fuentes && m.fuentes[k], huella = JSON.stringify([f || null, !!ctx.abrir, !!ctx.ajustar]);
    if (o.pie.dataset.huella === huella) return; o.pie.dataset.huella = huella; o.pie.textContent = ''; if (!f) return;
    if (ctx.abrir) { const b = el('button', 'cad-liga', 'Sale de «' + f.nombre + '» ↓'); b.type = 'button'; b.title = 'Abrir la tarjeta del plan de donde sale este eslabón'; b.addEventListener('click', () => { parar(); if (ctx.abrir) ctx.abrir(f.tarjeta); }); o.pie.append(b); }
    if (ctx.ajustar) (f.ajustes || []).forEach(([nombre, control, largo]) => { const b = el('button', 'cad-liga cad-ajuste', nombre); b.type = 'button'; b.title = 'Ir al control: ' + (largo || nombre); b.setAttribute('aria-label', 'Ajustar ' + (largo || nombre).toLowerCase()); b.addEventListener('click', () => { parar(); const g = ctx.ajustar ? ctx.ajustar(control) : null; if (g && g.classList) { g.classList.add('cad-senalado'); setTimeout(() => g.classList.remove('cad-senalado'), 1900); } }); o.pie.append(b); });
  }
  function ponerTodo(m, desde, dibuja) {
    const l = lectura(m), c = desde ? cambio(desde, m) : null; clearTimeout(tNotas);
    PAN.forEach(k => { visto[k] = m; textos(k, m, desde, false, l, c); });
    pintarD(m, false, desde);
    GRAF.forEach((k, n) => {
      const o = nd[k]; pintarGraf(k, m, l); o.plot.classList.remove('cad-sin-notas');
      if (dibuja && !reducido()) { o.plot.classList.add('cad-sin-notas'); setTimeout(() => { o.plot.classList.remove('cad-sin-notas'); anotar(k, true); }, 200 + n * 360); } else anotar(k, false);
    });
  }
  // Edición viva: barras y cifras al momento; las notas (lo caro) cuando la mano se detiene.
  let tNotas = 0;
  function ponerRapido(m, desde) {
    const l = lectura(m), c = desde ? cambio(desde, m) : null;
    PAN.forEach(k => { visto[k] = m; textos(k, m, desde, false, l, c); });
    pintarD(m, false, desde);
    GRAF.forEach(k => { const o = nd[k]; if (o.cuerpo.hidden) return; pintarGraf(k, m, l); o.plot.classList.add('cad-sin-notas'); o.gh.setAttribute('d', ''); });
    clearTimeout(tNotas); tNotas = setTimeout(() => { GRAF.forEach(k => { nd[k].plot.classList.remove('cad-sin-notas'); anotar(k, false); }); nd.raiz.classList.remove('cad-sinanim'); }, 170);
  }
  function sinAnim(fn) { nd.raiz.classList.add('cad-sinanim'); try { fn(); } finally { void nd.raiz.offsetWidth; nd.raiz.classList.remove('cad-sinanim'); } }
  function muelle(vs) {
    const m = S.m, lista = vs.map(v => ({ id: v.id, nombre: v.nombre, activa: v.activa, queda: v.u === null ? '' : corto(v.u) }));
    const huella = JSON.stringify([lista, !!ctx.verVersiones]);
    if (nd.vers.dataset.huella !== huella) {
      const foco = D.activeElement && nd.vers.contains(D.activeElement) ? D.activeElement.dataset.version : null;
      nd.vers.dataset.huella = huella; nd.vers.textContent = '';
      lista.forEach(v => {
        const b = el('button', 'cad-ver'); b.type = 'button'; b.dataset.version = v.id; b.setAttribute('aria-pressed', String(v.activa));
        b.append(el('span', '', v.nombre)); if (v.queda) b.append(el('small', '', 'queda ' + v.queda));
        b.addEventListener('click', () => { if (b.getAttribute('aria-pressed') === 'true' || !ctx.activar) return; propio = Date.now(); ctx.activar(v.id); });
        nd.vers.append(b); if (foco === v.id) b.focus({ preventScroll: true });
      });
      nd.vers.hidden = lista.length < 2;
      nd.una.hidden = lista.length >= 2; nd.una.textContent = '';
      if (lista.length < 2) { nd.una.title = 'Con dos o más versiones, aquí cambias entre ellas y la cadena se mueve sola.'; nd.una.append('Una sola versión guardada · '); if (ctx.verVersiones) { const b = el('button', 'cad-liga', 'Abrir versiones ↓'); b.type = 'button'; b.addEventListener('click', () => { if (ctx.verVersiones) ctx.verVersiones(); }); nd.una.append(b); } }
    }
    const activa = vs.find(v => v.activa);
    nd.ver.textContent = vs.length < 2 && activa && activa.nombre ? 'Versión «' + activa.nombre + '»' : '';
    nd.dock.hidden = vs.length >= 2;
    nd.fuenteT.textContent = (ctx.nativo ? 'Resultados de Sheets' + (ctx.revision ? ' · revisión ' + String(ctx.revision).slice(0, 8) : '') : 'Estimación de este plan') + ' · este diagrama no calcula: dibuja lo que el plan resolvió abajo. ';
    nd.tabla.hidden = !ctx.verTabla;
    const c = cuadre(m); nd.raiz.classList.toggle('cad-no-cuadra', c.length > 0);
    if (c.length) nd.fuenteT.textContent += 'Aviso: ' + c.length + ' dato(s) del dibujo no suman lo que reporta el plan. ';
  }

  /* ───────── la cadena: un eslabón tras otro ───────── */
  function luego(ms, fn) { const id = setTimeout(() => { const i = cadena.timers.indexOf(id); if (i >= 0) cadena.timers.splice(i, 1); fn(); }, ms); cadena.timers.push(id); }
  function quitarFantasmas() { GRAF.forEach(k => { if (!fant[k]) return; nd[k].gh.style.opacity = '0'; setTimeout(() => { if (cadena.activa) return; fant[k] = null; anotar(k, false); }, 550); }); }
  function terminar() {
    nd.raiz.classList.remove('cad-cadena'); PAN.forEach(k => { nd[k].pan.classList.remove('cad-foco'); nd.por[k].classList.remove('on'); });
    nd.rep.hidden = !ultima || reducido(); clearTimeout(cadena.tFant); cadena.tFant = setTimeout(quitarFantasmas, 9000);
  }
  function parar() {
    cadena.timers.forEach(clearTimeout); cadena.timers = [];
    if (!cadena.activa) return;
    cadena.activa = false; const d = cadena.destino, de = cadena.desde;
    GRAF.forEach(k => { fant[k] = de; });
    sinAnim(() => ponerTodo(d, de, false)); terminar();
  }
  // Deja a la vista el eslabón que se está contando. Sólo si la orden salió de este diagrama.
  function aVista(a) {
    if (!cadena.sigue) return false;
    const r = a.getBoundingClientRect(), vh = root.innerHeight || D.documentElement.clientHeight, tb = D.querySelector('.yod-topbar');
    const top = (tb ? Math.max(0, tb.getBoundingClientRect().bottom) : 0) + 8, bot = vh - 8;
    if (r.top >= top && r.bottom <= bot) return false;
    const dy = r.top < top || r.height > bot - top ? r.top - top : r.bottom - bot;
    if (Math.abs(dy) < 4) return false;
    try { root.scrollBy({ top: dy, left: 0, behavior: 'smooth' }); } catch (e) { root.scrollBy(0, dy); }
    return true;
  }
  function encender(por) { por.classList.add('on'); const p = por.querySelector('path'); p.style.transition = 'none'; p.style.strokeDashoffset = '1'; void p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset .45s ease-out'; p.style.strokeDashoffset = '0'; }
  function etapa(k, dest, prev, f, sig) {
    const o = nd[k], por = nd.por[k];
    PAN.forEach(q => nd[q].pan.classList.toggle('cad-foco', q === k));
    if (movil() && abierto !== k) { abierto = k; acordeon(); }
    encender(por);
    if (k !== 'D') o.plot.classList.add('cad-sin-notas');
    luego((aVista(o.pan) ? 380 : 0) + 260 * f, () => {
      visto[k] = dest; textos(k, dest, prev, true);
      if (k === 'D') { pintarD(dest, true, prev); sig(1500 * f); return; }
      fant[k] = prev; pintarGraf(k, dest); const H = o.plot.clientHeight; if (H) fantasma(k, SIL[k](dest, o, H), o.plot.clientWidth, H);
      luego(850 * f, () => { o.plot.classList.remove('cad-sin-notas'); anotar(k, true); });
      sig(1600 * f);
    });
  }
  // Lleva el diagrama de lo que enseña a una lectura nueva, eslabón por eslabón y en orden.
  function ir(dest, opt) {
    opt = opt || {}; parar(); clearTimeout(cadena.tFant);
    const desde = visto.A;
    GRAF.forEach(k => { fant[k] = null; nd[k].gh.setAttribute('d', ''); nd[k].pan.classList.remove('cad-con-antes'); });
    if (opt.instante || !desde) { ultima = null; nd.rep.hidden = true; sinAnim(() => ponerTodo(dest, null, !!opt.entrada)); return; }
    const c = cambio(desde, dest);
    if (!PAN.some(k => c[k].si)) { sinAnim(() => ponerTodo(dest, null, false)); return; }
    if (reducido() || opt.quieto) { GRAF.forEach(k => { fant[k] = desde; }); ultima = opt.quieto ? { desde, destino: dest } : null; sinAnim(() => ponerTodo(dest, desde, false)); if (opt.quieto) terminar(); return; }
    ultima = { desde, destino: dest };
    cadena.activa = true; cadena.sigue = !!opt.sigue; cadena.destino = dest; cadena.desde = desde;
    nd.raiz.classList.add('cad-cadena'); limpiarCursor(); nd.rep.hidden = true;
    const f = opt.lento ? 1.6 : 1, pasos = [];
    PAN.forEach(k => {
      if (c[k].si) pasos.push(sig => etapa(k, dest, desde, f, sig));
      else pasos.push(sig => { visto[k] = dest; textos(k, dest, null, false); if (k === 'D') pintarD(dest, false, null); else { pintarGraf(k, dest); nd[k].plot.classList.remove('cad-sin-notas'); anotar(k, false); } sig(0); });
    });
    pasos.push(() => { cadena.activa = false; terminar(); });
    let i = 0; (function sig(ms) { luego(ms || 0, () => { if (i < pasos.length) pasos[i++](sig); }); })(0);
  }
  function repetir() {
    if (!ultima || reducido() || !S || ultima.destino !== S.m) { ultima = null; nd.rep.hidden = true; return; }
    const u = ultima; parar(); clearTimeout(cadena.tFant);
    GRAF.forEach(k => { fant[k] = null; });
    sinAnim(() => ponerTodo(u.desde, null, false));
    luego(700, () => ir(u.destino, { lento: true, sigue: true }));
  }
  // Cambió algo mientras el diagrama no estaba a la vista: al volver, se cuenta en cadena.
  function alVolver() {
    pendiente = false; if (!S || !rafaga.antes) return;
    const antes = rafaga.antes; rafaga.antes = null;
    if (reducido()) { GRAF.forEach(k => { fant[k] = antes; }); sinAnim(() => ponerTodo(S.m, antes, false)); return; }
    sinAnim(() => ponerTodo(antes, null, false)); luego(350, () => ir(S.m));
  }

  // Sin estado confirmado (captura de un plan nuevo, lectura de otro caso) el diagrama no enseña nada del anterior.
  function limpiar() {
    if (!nd) return;
    cadena.timers.forEach(clearTimeout); cadena.timers = []; cadena.activa = false; clearTimeout(cadena.tFant); clearTimeout(rafaga.t); clearTimeout(tNotas);
    rafaga.antes = null; pendiente = false; ultima = null; S = null; propio = 0;
    nd.raiz.hidden = true; nd.raiz.classList.remove('cad-cadena'); nd.vers.textContent = ''; delete nd.vers.dataset.huella; nd.ver.textContent = ''; nd.una.textContent = ''; nd.rep.hidden = true; nd.fuenteT.textContent = '';
    PAN.forEach(k => { const o = nd[k]; visto[k] = null; fant[k] = null; o.cifra.textContent = ''; o.frase.textContent = ''; o.dijo.textContent = ''; o.dijo.hidden = true; o.pan.classList.remove('cad-foco', 'cad-con-antes'); if (o.prod) { o.prodH = ''; o.prodT.textContent = ''; o.prodBar.textContent = ''; o.prodLey.textContent = ''; } o.pie.textContent = ''; delete o.pie.dataset.huella; for (const id in o.notas) ocultarNota(o.notas[id]); if (o.gh) o.gh.setAttribute('d', ''); if (o.tip) o.tip.textContent = ''; });
    const d = nd.D; for (const id in d.fila) { d.fila[id].v.textContent = ''; d.fila[id].v._v = undefined; d.fila[id].d.textContent = ''; } d.rangoT.textContent = ''; d.rangoRiel.textContent = ''; d.sociosLey.textContent = ''; d.sociosBar.textContent = '';
  }

  /* ───────── entrada única: el tablero avisa cada vez que tiene un estado confirmado ───────── */
  function update(tipo, estado, contexto) {
    try { return actualizar(tipo, estado, contexto); }
    catch (e) { try { limpiar(); } catch (_) { /* nada */ } if (root.console) root.console.error('PPPCadena', e); return false; }
  }
  function actualizar(tipo, estado, contexto) {
    contexto = contexto || {};
    const m = modelo(tipo, estado);
    if (!nd) { if (!m) return false; montar(contexto.ancla); }
    ctx = contexto;
    if (!m) { limpiar(); return false; }
    nd.raiz.hidden = false;
    const clave = String(contexto.caso || '') + '|' + tipo, f = firma(m), previo = S;
    const motivo = !previo ? 'entrada' : previo.clave !== clave ? 'caso' : previo.version !== contexto.version ? 'version' : previo.f !== f ? 'edicion' : 'igual';
    S = { m, f, clave, tipo, version: contexto.version, rango: null };
    const lista = (Array.isArray(contexto.versiones) ? contexto.versiones : []).map(v => { const mv = v.activa ? m : modelo(tipo, v.estado); return { id: String(v.id), nombre: v.nombre || 'Versión', activa: !!v.activa, u: mv && ok(mv.queda.utilidad) ? mv.queda.utilidad : null }; });
    const us = lista.filter(x => x.u !== null);
    if (us.length >= 2) S.rango = { lo: Math.min(...us.map(x => x.u)), hi: Math.max(...us.map(x => x.u)), pts: us };
    acordeon(); muelle(lista);
    if (motivo === 'igual') { S.m = previo.m; if (!cadena.activa) { PAN.forEach(k => pie(k, S.m)); pintarRango(); } return true; }
    if (motivo === 'entrada' || motivo === 'caso') { rafaga.antes = null; pendiente = false; clearTimeout(rafaga.t); ir(m, { instante: true, entrada: motivo === 'entrada' }); return true; }
    if (motivo === 'version') {
      clearTimeout(rafaga.t); rafaga.antes = null; pendiente = false;
      const sigue = Date.now() - propio < 20000; propio = 0;
      if (enVista || sigue) ir(m, { sigue }); else { rafaga.antes = cadena.activa ? cadena.desde : previo.m; pendiente = true; ir(m, { quieto: true }); }
      return true;
    }
    // Edición de un dato abajo: se repinta al momento y se guarda el «antes» de toda la ráfaga.
    if (!rafaga.antes) rafaga.antes = cadena.activa ? cadena.desde : previo.m;
    clearTimeout(rafaga.t);
    const antes = rafaga.antes;
    parar();
    if (!enVista) { pendiente = true; return true; }      // fuera de la vista no se pinta: se cuenta al volver
    GRAF.forEach(k => { fant[k] = antes; }); ultima = { desde: antes, destino: m };
    nd.raiz.classList.add('cad-sinanim'); ponerRapido(m, antes); nd.rep.hidden = reducido();
    clearTimeout(cadena.tFant);
    rafaga.t = setTimeout(() => { rafaga.antes = null; cadena.tFant = setTimeout(quitarFantasmas, 9000); }, 2500);
    return true;
  }

  root.PPPCadena = Object.assign({ update, limpiar, estado: () => (S ? { tipo: S.tipo, version: S.version, firma: S.f, cadena: cadena.activa, abierto } : null) }, puro);
})(typeof window === 'undefined' ? globalThis : window);
