/* PPP Macrolotes · capa de presentación (solo vista).
   Recorrido por clics: Decisiones (lista) → sección → fila con su valor → control.
   - No calcula nada propio: lee el mismo estado que pinta render().
   - Los controles originales se MUEVEN (nunca se clonan): IDs, listeners,
     guardado, versiones, chinches y salto desde fórmulas siguen intactos. */
(function (root) {
  'use strict';
  const valid = v => typeof v === 'number' && Number.isFinite(v);
  const clamp01 = v => valid(v) ? Math.max(0, Math.min(1, v)) : 0;
  const money = v => valid(v) ? '$' + (v / 1e6).toLocaleString('es-MX', {maximumFractionDigits: 1}) + ' M' : '—';
  const pct = v => valid(v) ? (v * 100).toLocaleString('es-MX', {maximumFractionDigits: 0}) + '%' : '—';
  const num = (v, d = 0) => valid(v) ? v.toLocaleString('es-MX', {maximumFractionDigits: d}) : '—';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced = () => root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Icono por sección, según palabras del título. */
  /* Icono y tono por sección, según palabras del título. Tono = significado:
     terr (terreno), ing (ingresos), cost (costos), fin (crédito), time (tiempo), agua, ener (energía), gente. */
  const TOPIC_ICONS = [
    [/geometr/i, 'ti-dimensions', 'terr'], [/cuadro de áreas/i, 'ti-chart-pie', 'terr'], [/reparto/i, 'ti-chart-donut', 'ing'], [/^producto/i, 'ti-box', 'ing'],
    [/precio/i, 'ti-tag', 'ing'], [/vivienda/i, 'ti-home', 'gente'], [/estrategia/i, 'ti-route', 'ing'], [/partidas/i, 'ti-backhoe', 'cost'],
    [/redes/i, 'ti-topology-star', 'cost'], [/obra fija/i, 'ti-tool', 'cost'], [/norma/i, 'ti-certificate', 'cost'], [/construcci/i, 'ti-crane', 'cost'],
    [/blandos/i, 'ti-file-invoice', 'cost'], [/terreno/i, 'ti-map-pin', 'terr'], [/calendario|absorci/i, 'ti-calendar-time', 'time'],
    [/cobro/i, 'ti-cash', 'ing'], [/financ/i, 'ti-building-bank', 'fin'], [/candado/i, 'ti-lock', 'agua'], [/dotaci/i, 'ti-droplets', 'agua'],
    [/giro/i, 'ti-building-warehouse', 'gente'], [/cuadro de agua/i, 'ti-droplet', 'agua'], [/pluvial/i, 'ti-cloud-rain', 'agua'], [/vial/i, 'ti-car', 'gente'],
    [/estacionamiento/i, 'ti-parking', 'gente'], [/sanitario|ptar|residuos/i, 'ti-recycle', 'agua'], [/eléctric|cargas/i, 'ti-bolt', 'ener'], [/demograf/i, 'ti-users', 'gente']
  ];
  const topicOf = t => TOPIC_ICONS.find(([re]) => re.test(t)) || [0, 'ti-point', 'terr'];
  const topicIcon = t => topicOf(t)[1];
  /* Icono por ajuste: dice qué es cada número (frente, precio, %, meses…). Si no hay, el de su sección. */
  const CONTROL_ICONS = [
    [/^frente/i, 'ti-arrow-autofit-width'], [/^fondo/i, 'ti-arrow-autofit-height'], [/ancho|separaci/i, 'ti-arrows-horizontal'],
    [/luminar|alumbrado/i, 'ti-bulb'], [/barda/i, 'ti-wall'], [/vialidad|pavimen|banqueta|guarnic/i, 'ti-road'],
    [/renta/i, 'ti-receipt'], [/vacancia/i, 'ti-door'], [/precio|valor|\$|costo|pu |ptar|cisterna|subestaci|caseta|señal/i, 'ti-currency-dollar'],
    [/deuda|capital|ltc|equity/i, 'ti-building-bank'], [/tasa|pik|tir|comisi|fee|cap /i, 'ti-percentage'],
    [/mes|calendario|inicio/i, 'ti-calendar'], [/etapa/i, 'ti-stairs'], [/naves?\b|nave /i, 'ti-building-warehouse'],
    [/comercial|local/i, 'ti-building-store'], [/vivienda|habitante/i, 'ti-home'], [/lote|macro/i, 'ti-map-2'],
    [/agua|dotaci|riego|l\/|reuso/i, 'ti-droplet'], [/lluvia|pluvial|escurr|tormenta|retenci/i, 'ti-cloud-rain'],
    [/eléctric|carga|kva|w\/m|demanda|factor/i, 'ti-bolt'], [/cajón|cajon|estacion|camión|camion/i, 'ti-parking'],
    [/viaje|carril|pesado|tránsito|transito/i, 'ti-truck'], [/emple|trabaj/i, 'ti-briefcase'], [/residuo|basura|acopio/i, 'ti-trash'],
    [/verde|jardin/i, 'ti-leaf'], [/%|porcentaje|eficiencia|cos\b|mezcla/i, 'ti-percentage'], [/m²|m2|superficie/i, 'ti-ruler-2']
  ];
  const controlIcon = (label, fallback) => (CONTROL_ICONS.find(([re]) => re.test(label)) || [0, fallback || 'ti-adjustments'])[1];
  const topicTone = t => topicOf(t)[2];
  /* "1. Tratamiento del terreno" → título; lo que va tras "·", "(" o "—" pasa a nota. */
  function splitTitle(text) {
    const t = String(text || '').replace(/^\s*\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
    const m = t.match(/^(.*?)(?:\s[·—]\s|\s\(|\s—)(.*)$/);
    const title = (m ? m[1] : t).trim(), note = m ? m[2].replace(/\)$/, '').trim() : '';
    return {title: title.charAt(0).toUpperCase() + title.slice(1), note};
  }
  const shortLabel = t => splitTitle(t).title;
  /* Etiqueta de control: antes de "(" o "·". */
  function splitLabel(text) {
    const t = String(text || '').replace(/\?$/, '').replace(/\s+/g, ' ').trim();
    const m = t.match(/^(.*?)\s*[(·]\s*(.*)$/);
    return {label: (m ? m[1] : t).trim(), help: m ? m[2].replace(/\)$/, '').trim() : ''};
  }

  /* Ficha de cada decisión: número principal, detalle y barrita de nivel (0–1) cuando tiene sentido. */
  const CARD_TILE = {
    dTerreno: r => ({fig: num(valid(r.superficie) ? r.superficie / 10000 : null, 1) + ' ha', sub: pct(r.vendiblePct) + ' vendible', gauge: r.vendiblePct}),
    dMezcla: r => ({fig: money(r.ingresos), sub: 'ventas · ' + num(r.nNaves) + ' naves · ' + num(r.nViv) + ' lotes viv.'}),
    dUrb: r => ({fig: money(r.urbanizacion), sub: valid(r.urbanizacion) && valid(r.costoProyecto) && r.costoProyecto > 0 ? pct(r.urbanizacion / r.costoProyecto) + ' del costo' : '—', gauge: valid(r.costoProyecto) && r.costoProyecto > 0 ? r.urbanizacion / r.costoProyecto : null}),
    dCostos: r => ({fig: money(r.costoProyecto), sub: 'utilidad ' + pct(r.margenFinal), gauge: r.margenFinal, warn: valid(r.utilidadFinal) && r.utilidadFinal < 0}),
    dCapital: r => ({fig: num(r.totalMonths) + ' meses', sub: r.peak > 1 ? 'deuda pico ' + money(r.peak) : 'sin deuda dispuesta', gauge: valid(r.peak) && valid(r.debtCap) && r.debtCap > 0 ? r.peak / r.debtCap : null}),
    dAgua: r => ({fig: num(r.aguaDia, 0) + ' m³/día', sub: ['Agua en veda', 'Agua en trámite', 'Agua asignada'][(r.p || {}).gateAgua] || '—', warn: (r.p || {}).gateAgua === 0})
  };
  const CARD_TONE = {dTerreno: 'terr', dMezcla: 'ing', dUrb: 'cost', dCostos: 'cost', dCapital: 'fin', dAgua: 'agua'};
  const CARD_TITLES = {dTerreno: 'Terreno y áreas', dMezcla: 'Producto e ingresos', dUrb: 'Urbanización',
    dCostos: 'Naves y gastos blandos', dCapital: 'Capital y calendario', dAgua: 'Servicios'};

  const $ = id => document.getElementById(id);
  const valueOf = id => $(id) ? Number($(id).value) : null;
  const shown = id => (document.querySelector('.val-display[data-input="' + id + '"]')?.textContent || '').trim();
  /* Número de cada ficha de sección: plantillas para las clave; si no, el primer valor. */
  const sumOf = ids => ids.map(valueOf).reduce((a, b) => a + (b || 0), 0);
  const SECTION_SUMMARY = [
    [/geometr/i, () => ({fig: shown('inFrente') + ' × ' + shown('inFondo') + ' m', sub: 'frente × fondo'})],
    [/cuadro de áreas/i, () => { const c = sumOf(['inPctVialidades','inPctBanquetas','inPctVerdes','inPctEquipamiento','inPctRetencion','inPctDDV']); return {fig: num(100 - c) + '%', sub: 'vendible · cesiones ' + num(c) + '%', gauge: (100 - c) / 100}; }],
    [/reparto del área vendible/i, () => { const t = sumOf(['inMixNaves','inMixMacro','inMixCom','inMixViv']); return {fig: num(t) + '%', sub: Math.abs(t - 100) > .5 ? 'el reparto debe sumar 100%' : 'reparto completo', warn: Math.abs(t - 100) > .5, gauge: t / 100}; }]
  ];

  let mounted = false, last = null;
  const cards = [];

  /* ---------- Gráfica por tarjeta (dentro de la tarjeta abierta) ---------- */
  const CHART_CARDS = ['dTerreno', 'dMezcla', 'dUrb', 'dCostos', 'dCapital', 'dAgua'];
  /* Colores de producto (los mismos del plano y del embudo). */
  const PRODUCT = {naves: 'var(--gold)', macro: 'var(--blue)', com: 'var(--teal)', viv: 'var(--green)'};

  /* ---------- Infográfico vivo de cada decisión (56 × 56) ---------- */
  function infographic(id, r) {
    const p = r.p || {}, acc = 'var(--acc)', faint = 'color-mix(in srgb,var(--acc) 14%,transparent)', line = 'color-mix(in srgb,var(--acc) 55%,transparent)';
    const svg = inner => '<svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true" focusable="false">' + inner + '</svg>';
    const arc = (cx, cy, rad, a0, a1) => { const P = a => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; const [x0, y0] = P(a0), [x1, y1] = P(a1); return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + rad + ' ' + rad + ' 0 ' + (a1 - a0 > Math.PI ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2); };
    const donut = parts => { const total = parts.reduce((a, x) => a + (valid(x.v) && x.v > 0 ? x.v : 0), 0); if (!total) return '<circle cx="28" cy="28" r="18" fill="none" stroke="' + faint + '" stroke-width="7"/>';
      let a = -Math.PI / 2, out = '<circle cx="28" cy="28" r="18" fill="none" stroke="' + faint + '" stroke-width="7"/>';
      parts.forEach(x => { if (!(valid(x.v) && x.v > 0)) return; const b = a + x.v / total * Math.PI * 2 - .04; if (b - a > .02) out += '<path d="' + arc(28, 28, 18, a, Math.min(b, a + Math.PI * 1.999)) + '" fill="none" stroke="' + x.c + '" stroke-width="7" stroke-linecap="butt"/>'; a = b + .04; });
      return out; };
    if (id === 'dTerreno') {
      // Polígono a escala (frente × fondo) con la parte vendible rellena; la carretera es la línea gruesa del frente.
      const f = valid(p.frente) ? p.frente : 1, d = valid(p.fondo) ? p.fondo : 1, k = 38 / Math.max(f, d), w = Math.max(10, d * k), h = Math.max(10, f * k);
      const x = 28 - w / 2 + 3, y = 28 - h / 2, v = clamp01(r.vendiblePct);
      return svg('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="' + faint + '" stroke="' + line + '"/>' +
        '<rect x="' + (x + w * (1 - v)) + '" y="' + y + '" width="' + (w * v) + '" height="' + h + '" rx="2" fill="' + acc + '" opacity=".45"/>' +
        (() => { let lots = ''; const x0 = x + w * (1 - v), n = Math.max(2, Math.round(w * v / 6)); for (let i = 1; i < n; i++) lots += 'M' + (x0 + w * v * i / n).toFixed(1) + ' ' + y + 'V' + (y + h); lots += 'M' + x0.toFixed(1) + ' ' + (y + h / 2).toFixed(1) + 'H' + (x + w).toFixed(1); return '<path d="' + lots + '" stroke="var(--card)" stroke-width="1.2"/>'; })() +
        '<path d="M' + (x - 4) + ' ' + (y - 2) + 'V' + (y + h + 2) + '" stroke="' + acc + '" stroke-width="3" stroke-linecap="round"/>');
    }
    if (id === 'dMezcla') return svg(donut([{v: r.ingNaves, c: PRODUCT.naves}, {v: r.ingMacro, c: PRODUCT.macro}, {v: r.ingCom, c: PRODUCT.com}, {v: r.ingViv, c: PRODUCT.viv}]));
    if (id === 'dUrb') {
      // Traza de calles; la parte coloreada es lo que pesa la urbanización dentro del costo.
      const share = valid(r.urbanizacion) && valid(r.costoProyecto) && r.costoProyecto > 0 ? clamp01(r.urbanizacion / r.costoProyecto) : 0;
      return svg('<rect x="8" y="8" width="40" height="40" rx="6" fill="' + faint + '"/>' +
        '<path d="M8 22H48M8 36H48M22 8V48M36 8V48" stroke="' + line + '" stroke-width="3"/>' +
        '<rect x="8" y="' + (48 - 40 * share) + '" width="40" height="' + (40 * share) + '" rx="6" fill="' + acc + '" opacity=".35"/>' +
        '<circle cx="22" cy="22" r="2.5" fill="' + acc + '"/><circle cx="36" cy="36" r="2.5" fill="' + acc + '"/>');
    }
    if (id === 'dCostos') {
      const util = valid(r.utilidadFinal) ? Math.max(0, r.utilidadFinal) : 0, cost = valid(r.ingresos) ? Math.max(0, r.ingresos - util) : 0;
      return svg(donut([{v: cost, c: 'var(--red)'}, {v: util, c: 'var(--green)'}]));
    }
    if (id === 'dCapital') {
      // Curva real de la deuda mes a mes, con el pico marcado.
      const fl = Array.isArray(r.flows) ? r.flows.filter(f => valid(f.debt)) : [], max = Math.max(1, ...fl.map(f => f.debt)), n = Math.max(1, fl.length - 1);
      const pts = fl.map((f, i) => [8 + i / n * 40, 44 - f.debt / max * 30]);
      const path = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
      const peak = pts.reduce((a, q) => q[1] < a[1] ? q : a, [0, 99]);
      return svg('<path d="M8 44H48" stroke="' + line + '" stroke-width="1.5"/>' + (path ? '<path d="' + path + 'L48 44L8 44Z" fill="' + faint + '"/><path d="' + path + '" fill="none" stroke="' + acc + '" stroke-width="2.2" stroke-linejoin="round"/>' : '') +
        (peak[1] < 99 && r.peak > 1 ? '<circle cx="' + peak[0].toFixed(1) + '" cy="' + peak[1].toFixed(1) + '" r="3" fill="' + acc + '"/>' : ''));
    }
    if (id === 'dAgua') {
      // Gota que se llena con la demanda contra la dotación recomendada; roja si el agua está en veda.
      const ref = valid(r.superficie) && r.superficie > 0 ? r.superficie / 10000 * 86.4 : null, lvl = valid(r.aguaDia) && ref ? clamp01(r.aguaDia / ref) : 0;
      const tone = p.gateAgua === 0 ? 'var(--red)' : acc, drop = 'M28 8C28 8 14 24 14 33a14 14 0 0 0 28 0C42 24 28 8 28 8Z', top = 47 - 39 * lvl;
      return svg('<defs><clipPath id="pmDrop"><path d="' + drop + '"/></clipPath></defs><path d="' + drop + '" fill="' + faint + '"/>' +
        '<rect x="12" y="' + top.toFixed(1) + '" width="32" height="40" fill="' + tone + '" opacity=".55" clip-path="url(#pmDrop)"/><path d="' + drop + '" fill="none" stroke="' + tone + '" stroke-width="2"/>');
    }
    return '';
  }
  function stack(parts, total) {
    if (!valid(total) || total <= 0) return '<div class="pm-stack pm-empty">Datos pendientes</div>';
    const shownParts = parts.filter(p => valid(p.value) && p.value > 0);
    return '<div class="pm-stack" role="img" aria-label="' + esc(shownParts.map(p => p.name + ' ' + pct(p.value / total)).join(', ')) + '">' +
      shownParts.map(p => '<span class="pm-seg" style="width:' + (clamp01(p.value / total) * 100).toFixed(2) + '%;background:' + p.color + '" title="' + esc(p.name + ' · ' + money(p.value) + ' · ' + pct(p.value / total)) + '"></span>').join('') + '</div>' +
      '<div class="pm-legend">' + shownParts.map(p => '<span><i style="background:' + p.color + '"></i>' + esc(p.name) + ' <b>' + pct(p.value / total) + '</b></span>').join('') + '</div>';
  }
  function meter(label, value, scaleText, color, valueText) {
    return '<div class="pm-meter' + (valid(value) ? '' : ' pm-missing') + '"><div class="pm-meter-head"><span>' + esc(label) + '</span><b>' + esc(valueText) + '</b></div>' +
      '<div class="pm-track"><span style="width:' + (clamp01(value) * 100).toFixed(1) + '%;background:' + color + '"></span></div>' +
      '<small>' + esc(scaleText) + (valid(value) && value > 1 ? ' · rebasa la escala' : '') + '</small></div>';
  }
  function chartHtml(id, r) {
    const p = r.p || {};
    if (id === 'dTerreno') {
      const sup = r.superficie, ces = valid(r.sumaCesiones) && valid(sup) ? r.sumaCesiones * sup : null;
      return '<div class="pm-chart-title">Cómo se usa el terreno</div>' +
        stack([{name: 'Vendible', value: r.vendible, color: 'var(--purple)'}, {name: 'Calles', value: r.m2Vial, color: 'var(--orange)'},
               {name: 'Otras cesiones', value: valid(ces) && valid(r.m2Vial) ? ces - r.m2Vial : null, color: 'var(--suave)'}], sup);
    }
    if (id === 'dMezcla') {
      return '<div class="pm-chart-title">De dónde salen las ventas</div>' +
        stack([{name: 'Naves', value: r.ingNaves, color: PRODUCT.naves}, {name: 'Macro-lotes', value: r.ingMacro, color: PRODUCT.macro},
               {name: 'Comercial', value: r.ingCom, color: PRODUCT.com}, {name: 'Vivienda', value: r.ingViv, color: PRODUCT.viv}], r.ingresos);
    }
    if (id === 'dUrb') {
      const total = valid(r.urbVariable) && valid(r.obraFija) ? r.urbVariable + r.obraFija : r.urbanizacion;
      const share = valid(r.urbanizacion) && valid(r.costoProyecto) && r.costoProyecto > 0 ? r.urbanizacion / r.costoProyecto : null;
      return stack([{name: 'Calles y redes', value: r.urbVariable, color: 'var(--orange)'}, {name: 'Obra fija', value: r.obraFija, color: 'var(--purple)'}], total) +
        meter('Urbanización / costo del proyecto', share, 'escala 0–100% del costo', 'var(--red)', pct(share));
    }
    if (id === 'dCostos') {
      const fin = valid(r.interest) && valid(r.feeDebt) ? r.interest + r.feeDebt : null;
      const known = [r.urbanizacion, r.construccion, r.blandos, fin].filter(valid).reduce((a, b) => a + b, 0);
      const util = valid(r.utilidadFinal) ? r.utilidadFinal : null;
      const otros = valid(r.ingresos) ? r.ingresos - known - Math.max(0, util || 0) : null;
      return '<div class="pm-chart-title">De cada peso vendido</div>' +
        stack([{name: 'Urbanización', value: r.urbanizacion, color: 'var(--orange)'}, {name: 'Construcción', value: r.construccion, color: 'var(--red)'},
               {name: 'Blandos', value: r.blandos, color: 'var(--purple)'}, {name: 'Financieros', value: fin, color: 'var(--blue)'},
               {name: 'Terreno y otros', value: valid(otros) && otros > r.ingresos * .005 ? otros : null, color: 'var(--suave)'},
               {name: 'Utilidad', value: util !== null && util > 0 ? util : null, color: 'var(--green)'}], r.ingresos) +
        (util !== null && util < 0 ? '<div class="pm-warn"><i class="ti ti-alert-triangle"></i> Pérdida de ' + money(-util) + ': el costo rebasa las ventas</div>' : '');
    }
    if (id === 'dCapital') {
      const months = r.totalMonths, ok = valid(months) && months > 0;
      const mark = ok && valid(r.peakMonth) ? clamp01((r.peakMonth - 1) / Math.max(1, months - 1)) * 100 : null;
      const urbEnd = ok && valid(p.etapas) && valid(p.mesesUrbEtapa) ? clamp01(p.etapas * p.mesesUrbEtapa / months) * 100 : null;
      const sell = ok && valid(p.inicioVentas) ? clamp01((p.inicioVentas - 1) / months) * 100 : null;
      const ratio = valid(r.peak) && valid(r.debtCap) && r.debtCap > 0 ? r.peak / r.debtCap : null;
      return '<div class="pm-chart-title">Calendario · ' + num(months) + ' meses</div>' +
        '<div class="pm-timeline" role="img" aria-label="Urbanización y ventas en el tiempo">' +
        (urbEnd !== null ? '<span class="pm-tl-urb" style="width:' + urbEnd.toFixed(1) + '%"></span>' : '') +
        (sell !== null ? '<span class="pm-tl-sell" style="left:' + sell.toFixed(1) + '%"></span>' : '') +
        (mark !== null && r.peak > 1 ? '<span class="pm-tl-peak" style="left:' + mark.toFixed(1) + '%"></span>' : '') + '</div>' +
        '<div class="pm-legend"><span><i style="background:var(--orange)"></i>Urbanización</span><span><i style="background:var(--green)"></i>Ventas desde mes ' + num(p.inicioVentas) + '</span>' +
        (r.peak > 1 ? '<span><i style="background:var(--purple)"></i>Pico de deuda mes ' + num(r.peakMonth) + '</span>' : '<span>Sin deuda dispuesta</span>') + '</div>' +
        meter('Deuda pico / límite', ratio, 'límite modelado ' + money(r.debtCap) + ', no es crédito autorizado', 'var(--purple)', money(r.peak));
    }
    if (id === 'dAgua') {
      const ref = valid(r.superficie) && r.superficie > 0 ? r.superficie / 10000 * 86.4 : null; // NMX-R-046: 1 l/s/ha
      return meter('Agua / dotación recomendada', valid(r.aguaDia) && ref ? r.aguaDia / ref : null, 'referencia NMX 1 l/s/ha = ' + num(ref) + ' m³/día para este terreno', 'var(--blue)', num(r.aguaDia, 1) + ' m³/día') +
        meter('Electricidad', valid(r.demandaKva) ? r.demandaKva / 10000 : null, 'escala 0–10 MVA', 'var(--orange)', num(valid(r.demandaKva) ? r.demandaKva / 1000 : null, 2) + ' MVA');
    }
    return '';
  }

  /* ---------- N1/N2: cada tarjeta como fila de decisión ---------- */
  function buildCard(card) {
    const id = card.dataset.card, drawer = $(id), header = card.querySelector('.card-header');
    card.classList.add('pm-card');
    const titleEl = header.querySelector('.card-title');
    if (titleEl && CARD_TITLES[id]) { titleEl.dataset.original = titleEl.textContent; titleEl.textContent = CARD_TITLES[id]; }
    card.dataset.tone = CARD_TONE[id] || 'terr';
    const fig = document.createElement('b'); fig.className = 'pm-fig-main';
    const sum = document.createElement('span'); sum.className = 'pm-sum';
    const dot = document.createElement('i'); dot.className = 'pm-alert-dot'; dot.hidden = true; dot.setAttribute('aria-hidden', 'true');
    const gauge = document.createElement('span'); gauge.className = 'pm-gauge'; gauge.innerHTML = '<span></span>'; gauge.hidden = true;
    const close = document.createElement('i'); close.className = 'ti ti-x pm-close'; close.setAttribute('aria-hidden', 'true');
    const visual = document.createElement('span'); visual.className = 'pm-visual'; header.querySelector('.icon-box')?.after(visual);
    const text = document.createElement('span'); text.className = 'pm-cardtext';
    if (titleEl) { titleEl.before(text); text.append(titleEl); }
    const sub = document.createElement('span'); sub.className = 'pm-cardsub'; sub.append(dot, sum);
    text.append(fig, sub, gauge);
    header.append(close);
    header.setAttribute('role', 'button'); header.tabIndex = 0;
    header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
    // Franja de resultado: hasta 3 cifras tomadas de los mismos datos de la tarjeta.
    const strip = document.createElement('div'); strip.className = 'pm-strip';
    const boxes = [...card.querySelectorAll(':scope > .kpi-grid .kpi-box')].filter(b => b.querySelector('.kpi-val'));
    header.after(strip);
    let chart = null;
    if (CHART_CARDS.includes(id)) { chart = document.createElement('div'); chart.className = 'pm-chart'; strip.after(chart); }
    [strip, chart].forEach(el => el && el.addEventListener('click', e => e.stopPropagation())); // solo el encabezado abre/cierra
    const rec = {id, card, header, sum, fig, gauge, dot, visual, strip, boxes: boxes.slice(0, 3), chart, drawer};
    if (drawer) buildSections(rec);
    new MutationObserver(() => header.setAttribute('aria-expanded', String(card.classList.contains('open')))).observe(card, {attributes: true, attributeFilter: ['class']});
    header.setAttribute('aria-expanded', 'false');
    cards.push(rec);
  }

  /* ---------- N2 → N3 → N4 ---------- */
  function buildSections(rec) {
    const drawer = rec.drawer;
    drawer.classList.add('pm-drawer');
    const heads = [...drawer.querySelectorAll(':scope > .tema-head')];
    const list = document.createElement('div'); list.className = 'pm-seclist';
    if (heads[0]) heads[0].before(list);
    rec.sections = heads.map((head, i) => {
      const body = head._body || head.nextElementSibling;
      const raw = head.querySelector('.tema-txt')?.textContent || head.textContent;
      const {title, note} = splitTitle(raw);
      const sec = document.createElement('section'); sec.className = 'pm-sec'; sec.id = drawer.id + '-sec' + i;
      list.append(sec); sec.append(head, body); // head antes de su body: revelar() depende de eso.
      head.classList.add('pm-sechead'); head.title = raw;
      sec.dataset.tone = topicTone(raw);
      head.innerHTML = '<span class="pm-tile-top"><i class="ti ' + topicIcon(raw) + ' pm-secicon" aria-hidden="true"></i><i class="pm-changed" hidden title="Tiene valores ajustados"></i><span class="pm-count"></span><i class="ti ti-x pm-close" aria-hidden="true"></i></span>' +
        '<span class="tema-txt">' + esc(title) + '</span><b class="pm-secfig"></b><span class="pm-secsum"></span><span class="pm-gauge" hidden><span></span></span><span class="tema-n" hidden></span>';
      if (note) { const n = document.createElement('p'); n.className = 'pm-secnote'; const fixed = (note.split('(').length > note.split(')').length) ? note + ')' : note; n.textContent = fixed.charAt(0).toUpperCase() + fixed.slice(1); body.querySelector('.tema-inner').prepend(n); }
      if (body.classList.contains('abierto')) head.click(); // la lista arranca cerrada
      const rows = [...body.querySelectorAll('.input-group')].map(g => buildRow(g, drawer, topicIcon(raw))).filter(Boolean);
      // Una sección abierta a la vez por tarjeta: la ficha se vuelve panel en su lugar.
      new MutationObserver(() => {
        const open = body.classList.contains('abierto'); sec.classList.toggle('pm-sec-open', open);
        if (open) rec.sections.forEach(o => { if (o.body !== body && o.body.classList.contains('abierto')) o.head.click(); });
      }).observe(body, {attributes: true, attributeFilter: ['class']});
      return {head, body, raw, rows, sec, sumEl: head.querySelector('.pm-secsum'), figEl: head.querySelector('.pm-secfig'), countEl: head.querySelector('.pm-count'), dotEl: head.querySelector('.pm-changed'), gaugeEl: head.querySelector('.pm-gauge')};
    });
  }
  function buildRow(group, drawer, icon) {
    const input = group.querySelector('input[type=range]'), header = group.querySelector('.input-header');
    if (!input || !header || group.dataset.pmRow) return null;
    group.dataset.pmRow = '1'; group.classList.add('pm-row');
    const label = header.querySelector('label');
    const {label: short, help} = splitLabel(label?.textContent);
    if (label) { label.dataset.full = label.textContent; label.textContent = short; label.title = label.dataset.full; }
    const dot = document.createElement('i'); dot.className = 'pm-changed'; dot.title = 'Distinto al valor de referencia'; dot.hidden = true;
    (label?.parentElement === header ? label : label?.parentElement || header.firstChild).after(dot);
    const ico = document.createElement('i'); ico.className = 'ti ' + controlIcon(short + ' ' + (label?.dataset.full || ''), icon) + ' pm-rowicon'; ico.setAttribute('aria-hidden', 'true'); header.prepend(ico);
    const gauge = document.createElement('span'); gauge.className = 'pm-gauge pm-rowgauge'; gauge.innerHTML = '<span></span>'; header.append(gauge);
    const binary = input.min === '0' && input.max === '1' && Number(input.step || 1) === 1;
    const ctl = document.createElement('div'); ctl.className = 'pm-ctl';
    const inner = document.createElement('div'); inner.className = 'pm-ctl-inner';
    ctl.append(inner); header.after(ctl);
    const unit = help && help.length <= 8 ? help : '';
    if (unit && label) { const u = document.createElement('small'); u.className = 'pm-unit'; u.textContent = unit; label.append(' ', u); }
    if (help && !unit) { const h = document.createElement('p'); h.className = 'pm-help'; h.textContent = help.charAt(0).toUpperCase() + help.slice(1); inner.append(h); }
    inner.append(input);
    const scale = document.createElement('div'); scale.className = 'pm-scale';
    scale.innerHTML = '<span>' + esc(num(Number(input.min), 2)) + '</span><span>' + esc(num(Number(input.max), 2)) + '</span>';
    inner.append(scale);
    let sw = null, state = null;
    if (binary) {
      group.classList.add('pm-binary');
      sw = document.createElement('button'); sw.type = 'button'; sw.className = 'pm-switch'; sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-label', short);
      header.append(sw);
      sw.addEventListener('click', e => { e.stopPropagation(); input.value = input.value === '1' ? '0' : '1'; input.dispatchEvent(new Event('input', {bubbles: true})); });
      // Qué significa cada lado del interruptor: "0 = urbanizar… · 1 = vender…" → se muestra el lado activo.
      const m = String(label?.dataset.full || '').match(/0\s*=\s*([^·)]+?)\s*[·,]\s*1\s*=\s*([^)]+)/);
      state = document.createElement('span'); state.className = 'pm-binstate'; header.append(state);
      state._opts = m ? [m[1].trim(), m[2].trim()] : ['No', 'Sí'];
    }
    header.setAttribute('role', 'button'); header.tabIndex = 0; header.setAttribute('aria-expanded', 'false');
    const toggle = force => {
      const on = force === undefined ? !group.classList.contains('pm-edit') : force;
      if (on) drawer.querySelectorAll('.pm-row.pm-edit').forEach(o => { if (o !== group) { o.classList.remove('pm-edit'); o.querySelector('.input-header')?.setAttribute('aria-expanded', 'false'); } });
      group.classList.toggle('pm-edit', on); header.setAttribute('aria-expanded', String(on));
    };
    group._pmToggle = toggle;
    header.addEventListener('click', e => {
      if (e.target.closest('.val-display,.factor-help,.pm-switch')) return; // el valor se sigue pudiendo escribir a mano
      e.stopPropagation(); if (!binary) toggle();
    });
    header.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === header) { e.preventDefault(); binary ? sw.click() : toggle(); } });
    return {group, input, dot, sw, state, gauge, label: short};
  }
  /* Un salto a un control escondido (fórmulas, foco) abre su sección y su fila. */
  function reveal(input) {
    const group = input?.closest?.('.pm-row'); if (!group) return;
    const sec = group.closest('.pm-sec'), head = sec?.querySelector('.tema-head'), body = sec?.querySelector('.tema-body');
    const card = group.closest('.card');
    if (card && !card.classList.contains('open')) card.querySelector('.card-header')?.click();
    if (body && !body.classList.contains('abierto')) head.click();
    group._pmToggle?.(true);
  }

  /* ---------- Página: barra superior, veredicto, lista y gráficos ---------- */
  function buildPage() {
    const main = document.querySelector('main.container'); if (!main) return;
    document.body.classList.add('pm-ui');
    // Barra superior de una línea; al tocarla muestra todas las métricas.
    const hud = document.querySelector('.sticky-header .header-inner');
    if (hud && !hud.querySelector('.pm-hudline')) {
      const line = document.createElement('button'); line.type = 'button'; line.className = 'pm-hudline'; line.setAttribute('aria-expanded', 'false');
      line.innerHTML = '<span class="pm-h"><small>Utilidad · <em data-h="margen"></em></small><b data-h="util">—</b></span><span class="pm-h"><small>Deuda pico</small><b data-h="deuda">—</b></span><span class="pm-h pm-h-agua"><small>Agua</small><b><i class="pm-alert-dot"></i> <span data-h="agua">—</span></b></span><i class="ti ti-chevron-down pm-chev" aria-hidden="true"></i>';
      hud.prepend(line);
      line.addEventListener('click', () => { const on = !document.body.classList.contains('pm-hud-open'); document.body.classList.toggle('pm-hud-open', on); line.setAttribute('aria-expanded', String(on)); });
    }
    // Acciones secundarias dentro de "Más"; Guardar queda a la vista.
    const actions = document.querySelector('.caso-actions');
    if (actions && !actions.querySelector('.pm-more')) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'small-btn secondary pm-more'; more.setAttribute('aria-expanded', 'false');
      more.innerHTML = '<i class="ti ti-dots"></i>Más'; actions.prepend(more);
      more.addEventListener('click', () => { const on = !actions.classList.contains('pm-more-open'); actions.classList.toggle('pm-more-open', on); more.setAttribute('aria-expanded', String(on)); });
    }
    // Veredicto: la lectura y la nota de referencia van dentro de "Leer el resumen".
    const hero = main.querySelector('.hero'), lectura = $('heroLectura'), ref = main.querySelector('.reference-strip');
    if (hero && lectura && !hero.querySelector('.pm-read')) {
      const d = document.createElement('details'); d.className = 'pm-read';
      d.innerHTML = '<summary>Leer el resumen del caso</summary>'; lectura.before(d); d.append(lectura); if (ref) d.append(ref);
      const gate = $('heroGate');
      if (gate) { gate.setAttribute('role', 'button'); gate.tabIndex = 0; gate.title = 'Ver el candado del agua';
        const go = () => { const card = document.querySelector('.card[data-card=dAgua]'); if (card && !card.classList.contains('open')) card.querySelector('.card-header').click(); const sec = $('dAgua-sec0'); const body = sec?.querySelector('.tema-body'); if (body && !body.classList.contains('abierto')) sec.querySelector('.tema-head').click(); setTimeout(() => (sec || card)?.scrollIntoView({block: 'start', behavior: reduced() ? 'instant' : 'smooth'}), 60); };
        gate.addEventListener('click', go); gate.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); }
    }
    // Espacio de trabajo: Decisiones (izquierda) y gráficos en pestañas (derecha, fijo en escritorio).
    const deck = main.querySelector('section.grid-2'), grafs = main.querySelector('section.grafs');
    if (deck && grafs && !main.querySelector('.pm-work')) {
      const work = document.createElement('div'); work.className = 'pm-work';
      const left = document.createElement('div'); left.className = 'pm-col-dec';
      const right = document.createElement('div'); right.className = 'pm-col-viz';
      left.innerHTML = '<h2 class="pm-blocktitle">Decisiones</h2>';
      right.innerHTML = '<h2 class="pm-blocktitle">Ver el proyecto</h2>';
      (hero || deck).after(work); work.append(left, right); left.append(deck); right.append(grafs);
      deck.classList.add('pm-list');
      const vizCards = [...grafs.querySelectorAll(':scope > .viz-card')];
      const names = ['Plano', 'Embudo', 'Dinero', 'Corrida'];
      const tabs = document.createElement('div'); tabs.className = 'pm-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Gráficos del proyecto');
      grafs.before(tabs);
      const select = i => vizCards.forEach((v, j) => { const on = i === j; v.classList.toggle('pm-tab-on', on); v.hidden = !on; tabs.children[j].setAttribute('aria-selected', String(on)); tabs.children[j].tabIndex = on ? 0 : -1; });
      vizCards.forEach((v, i) => {
        v.id = v.id || 'pmViz' + i; v.setAttribute('role', 'tabpanel');
        const t = document.createElement('button'); t.type = 'button'; t.setAttribute('role', 'tab'); t.className = 'pm-tab';
        t.textContent = names[i] || ('Gráfico ' + (i + 1)); t.setAttribute('aria-controls', v.id); t.title = v.querySelector('.k')?.textContent || '';
        t.addEventListener('click', () => select(i));
        t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = (i + (e.key === 'ArrowRight' ? 1 : vizCards.length - 1)) % vizCards.length; select(n); tabs.children[n].focus(); } });
        tabs.append(t);
      });
      select(0);
    }
    // Saltos desde fórmulas y foco de teclado abren su fila antes de enfocar.
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-jump]'); if (b) reveal($(b.dataset.jump)); }, true);
    document.addEventListener('focusin', e => { if (e.target.matches?.('.pm-row input[type=range]')) reveal(e.target); });
  }

  /* ---------- Repintado con el estado del motor ---------- */
  /* "2,453 m³/día" → número grande y unidad chica, para que el número nunca se corte. */
  function setFig(el, text) {
    const t = String(text ?? ''), m = t.match(/^(.*?[\d—%)])\s+([^\d$]{1,14})$/);
    const html = m ? '<span>' + esc(m[1]) + '</span><small>' + esc(m[2]) + '</small>' : esc(t);
    if (el.dataset.m !== html) { el.innerHTML = html; el.dataset.m = html; }
  }
  const rangePos = i => { const mn = Number(i.min), mx = Number(i.max), v = Number(i.value); return mx > mn ? (v - mn) / (mx - mn) : null; };
  function setGauge(el, v) { if (!el) return; el.hidden = !valid(v); if (valid(v)) el.firstChild.style.width = (clamp01(v) * 100).toFixed(1) + '%'; el.classList.toggle('pm-over', valid(v) && v > 1); }
  function paint(r) {
    const p = r.p || {};
    const gate = p.gateAgua, blocked = gate === 0;
    cards.forEach(c => {
      const tile = CARD_TILE[c.id] ? CARD_TILE[c.id](r) : {fig: '', sub: ''};
      setFig(c.fig, tile.fig); c.sum.textContent = tile.sub; c.dot.hidden = !tile.warn; c.card.classList.toggle('pm-alert', !!tile.warn);
      setGauge(c.gauge, tile.gauge);
      const art = infographic(c.id, r); if (c.visual.dataset.m !== art) { c.visual.innerHTML = art; c.visual.dataset.m = art; }
      const strip = c.boxes.map(b => '<div class="pm-fig"><span>' + esc(b.querySelector('.kpi-lbl')?.textContent || '') + '</span><b class="' + esc(b.querySelector('.kpi-val').className.replace('kpi-val', '').trim()) + '">' + esc(b.querySelector('.kpi-val').textContent) + '</b></div>').join('');
      if (c.strip.dataset.m !== strip) { c.strip.innerHTML = strip; c.strip.dataset.m = strip; }
      if (c.chart) { const h = chartHtml(c.id, r); if (c.chart.dataset.m !== h) { c.chart.innerHTML = h; c.chart.dataset.m = h; } }
      (c.sections || []).forEach(s => {
        const tpl = SECTION_SUMMARY.find(([re]) => re.test(s.raw));
        let out;
        if (tpl) out = tpl[1]();
        else if (s.rows.length) out = {fig: shown(s.rows[0].input.id) || (s.rows[0].state ? s.rows[0].state.textContent : '—'), sub: s.rows[0].label + (s.rows.length > 1 ? ' y ' + (s.rows.length - 1) + ' más' : ''), gauge: rangePos(s.rows[0].input)};
        else { const act = s.body.querySelector('.active b,.active'); out = {fig: act ? act.textContent.trim() : 'Elegir', sub: 'opción elegida'}; }
        const changed = s.rows.filter(x => Number(x.input.value) !== Number(x.input.defaultValue)).length;
        s.rows.forEach(x => { x.dot.hidden = Number(x.input.value) === Number(x.input.defaultValue); if (x.sw) { x.sw.setAttribute('aria-checked', String(x.input.value === '1')); const t = x.state._opts[x.input.value === '1' ? 1 : 0]; x.state.textContent = t.charAt(0).toUpperCase() + t.slice(1); } setGauge(x.gauge, x.sw ? null : rangePos(x.input)); });
        setFig(s.figEl, out.fig); s.sumEl.textContent = out.sub;
        s.countEl.textContent = s.rows.length ? String(s.rows.length) : ''; s.countEl.title = s.rows.length + ' ajustes en esta sección';
        s.dotEl.hidden = !changed; s.dotEl.title = changed + (changed === 1 ? ' valor ajustado' : ' valores ajustados');
        s.sec.classList.toggle('pm-alert', !!out.warn); setGauge(s.gaugeEl, out.gauge);
      });
    });
    // Barra superior compacta.
    const set = (k, v) => { const el = document.querySelector('.pm-hudline [data-h="' + k + '"]'); if (el) el.textContent = v; };
    set('util', money(r.utilidadFinal)); set('margen', pct(r.margenFinal)); set('deuda', money(r.peak));
    set('agua', ['En veda', 'En trámite', 'Asignada'][gate] || '—');
    const dot = document.querySelector('.pm-h-agua .pm-alert-dot'); if (dot) dot.dataset.state = String(gate);
  }

  function mount() {
    if (mounted) return true;
    const list = [...document.querySelectorAll('.card[data-card]')];
    if (!list.length || !document.querySelector('.drawer .tema-head')) return false;
    mounted = true;
    list.forEach(buildCard);
    buildPage();
    return true;
  }
  function update(r) {
    last = r || last;
    if (!mount() || !last) return;
    try { paint(last); } catch (e) { console.warn('PPP vista: sin repintar', e); }
  }
  if (typeof module === 'object' && module.exports) module.exports = {shortLabel, splitTitle, splitLabel, topicIcon};
  if (!root.document) return;
  root.PPPMacroCards = {update, mount, reveal};
  document.addEventListener('DOMContentLoaded', () => update());
})(typeof window === 'undefined' ? globalThis : window);
