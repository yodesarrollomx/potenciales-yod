/* PPP Macrolotes · presentación de tarjetas (solo vista).
   - Tarjeta cerrada: 4 datos clave con icono + una gráfica chica por tarjeta.
   - Tarjeta abierta: "puntos" (chips) por subgrupo; cada punto abre su
     mini-tarjeta con sus mismos switches. Pueden quedar varias abiertas.
   No calcula nada propio: lee el mismo estado que pinta render() y mueve
   los controles originales sin clonarlos (IDs, listeners y guardado intactos). */
(function (root) {
  'use strict';
  const valid = v => typeof v === 'number' && Number.isFinite(v);
  const clamp01 = v => valid(v) ? Math.max(0, Math.min(1, v)) : 0;
  const money = v => valid(v) ? '$' + (v / 1e6).toLocaleString('es-MX', {maximumFractionDigits: 1}) + ' M' : '—';
  const pct = v => valid(v) ? (v * 100).toLocaleString('es-MX', {maximumFractionDigits: 0}) + '%' : '—';
  const num = (v, d = 0) => valid(v) ? v.toLocaleString('es-MX', {maximumFractionDigits: d}) : '—';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* Icono por dato (Tabler, ya cargado por el tablero). */
  const KPI_ICONS = {
    lblFxF: 'ti-dimensions', lblSupPer: 'ti-map-2', lblVendible: 'ti-square-check', lblVialidades: 'ti-road',
    lblNaves: 'ti-building-warehouse', lblMacro: 'ti-building-factory-2', lblCom: 'ti-building-store', lblViv: 'ti-home', lblIngresoM2: 'ti-cash',
    lblUrbTotal: 'ti-backhoe', lblUrbM2: 'ti-ruler-measure', lblLumBarda: 'ti-bulb', lblObraFija: 'ti-tool',
    lblConstNaves: 'ti-crane', lblBlandos: 'ti-file-invoice', lblCostoTotal: 'ti-receipt', lblSpreadM2: 'ti-trending-up',
    lblTierraModo: 'ti-map-pin', lblEtapas: 'ti-stairs', lblAbsorcion: 'ti-chart-arrows', lblMesesTotales: 'ti-calendar-time',
    lblDuenoM2: 'ti-user-dollar', lblCondPIK: 'ti-building-bank',
    lblGate: 'ti-lock', lblAguaDia: 'ti-droplet', lblKva: 'ti-bolt', lblEmpleos: 'ti-users', lblEficSuelo: 'ti-plant'
  };
  /* Icono por subgrupo, según palabras del título. */
  const TOPIC_ICONS = [
    [/geometr/i, 'ti-dimensions'], [/cuadro de áreas|reparto/i, 'ti-chart-pie'], [/producto$|^producto/i, 'ti-box'],
    [/precio/i, 'ti-tag'], [/vivienda/i, 'ti-home'], [/estrategia/i, 'ti-route'], [/partidas/i, 'ti-backhoe'],
    [/redes/i, 'ti-topology-star'], [/obra fija/i, 'ti-tool'], [/norma/i, 'ti-certificate'], [/construcci/i, 'ti-crane'],
    [/blandos/i, 'ti-file-invoice'], [/terreno/i, 'ti-map-pin'], [/calendario|absorci/i, 'ti-calendar-time'],
    [/cobro/i, 'ti-cash'], [/financ/i, 'ti-building-bank'], [/candado|agua/i, 'ti-droplet'], [/dotaci/i, 'ti-droplets'],
    [/giro/i, 'ti-building-warehouse'], [/pluvial/i, 'ti-cloud-rain'], [/vial/i, 'ti-car'], [/estacionamiento/i, 'ti-parking'],
    [/sanitario|ptar|residuos/i, 'ti-recycle'], [/eléctric|cargas/i, 'ti-bolt'], [/demograf/i, 'ti-users']
  ];
  const topicIcon = t => (TOPIC_ICONS.find(([re]) => re.test(t)) || [0, 'ti-point'])[1];
  /* "1. Tratamiento del terreno" → "Tratamiento del terreno"; corta notas largas. */
  function shortLabel(text) {
    let t = String(text || '').replace(/^\s*\d+\.\s*/, '').trim();
    t = t.split(/\s[·—]\s|\s\(|\s—|:\s/)[0].trim();
    return t.length > 34 ? t.slice(0, 32).trim() + '…' : t;
  }

  let mounted = false, last = null;
  const $ = id => document.getElementById(id);

  /* ---------- Tarjeta cerrada: iconos en los 4 datos ---------- */
  function decorateKpis(card) {
    card.classList.add('pm-card');
    card.querySelectorAll('.kpi-box').forEach((box, i) => {
      if (box.dataset.pmIcon) return;
      const val = box.querySelector('.kpi-val');
      const icon = (val && KPI_ICONS[val.id]) || 'ti-point';
      const i_ = document.createElement('i');
      i_.className = 'ti ' + icon + ' pm-kpi-icon';
      i_.setAttribute('aria-hidden', 'true');
      box.prepend(i_);
      box.dataset.pmIcon = '1';
      if (i >= 4) box.classList.add('pm-extra');
    });
  }

  /* ---------- Gráfica chica por tarjeta (solo donde no había una) ---------- */
  const CHART_CARDS = ['dUrb', 'dCostos', 'dCapital', 'dAgua'];
  function chartSlot(card) {
    let slot = card.querySelector(':scope > .pm-chart');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'pm-chart';
      const grid = card.querySelector(':scope > .kpi-grid');
      (grid || card.querySelector('.card-header')).after(slot);
    }
    return slot;
  }
  function stack(parts, total) {
    // Barra apilada: cada parte ocupa su fracción real del total.
    if (!valid(total) || total <= 0) return '<div class="pm-stack pm-empty">Datos pendientes</div>';
    return '<div class="pm-stack" role="img" aria-label="' + esc(parts.map(p => p.name + ' ' + pct(p.value / total)).join(', ')) + '">' +
      parts.filter(p => valid(p.value) && p.value > 0).map(p =>
        '<span class="pm-seg" style="width:' + (clamp01(p.value / total) * 100).toFixed(2) + '%;background:' + p.color + '" title="' + esc(p.name + ' · ' + money(p.value) + ' · ' + pct(p.value / total)) + '"></span>'
      ).join('') + '</div>' +
      '<div class="pm-legend">' + parts.filter(p => valid(p.value) && p.value > 0).map(p =>
        '<span><i style="background:' + p.color + '"></i>' + esc(p.name) + ' <b>' + pct(valid(p.value) ? p.value / total : null) + '</b></span>'
      ).join('') + '</div>';
  }
  function meter(label, value, scaleText, color, valueText) {
    const missing = !valid(value);
    return '<div class="pm-meter' + (missing ? ' pm-missing' : '') + '"><div class="pm-meter-head"><span>' + esc(label) + '</span><b>' + esc(valueText) + '</b></div>' +
      '<div class="pm-track"><span style="width:' + (clamp01(value) * 100).toFixed(1) + '%;background:' + color + '"></span></div>' +
      '<small>' + esc(scaleText) + (valid(value) && value > 1 ? ' · rebasa la escala' : '') + '</small></div>';
  }
  function paintCharts(r) {
    const p = r.p || {};
    CHART_CARDS.forEach(id => {
      const card = document.querySelector('.card[data-card="' + id + '"]');
      if (!card) return;
      const slot = chartSlot(card);
      let html = '';
      if (id === 'dUrb') {
        const total = valid(r.urbVariable) && valid(r.obraFija) ? r.urbVariable + r.obraFija : r.urbanizacion;
        html = '<div class="pm-chart-title">Cómo se reparte la urbanización · ' + money(total) + '</div>' +
          stack([{name: 'Por cantidad (calles, redes)', value: r.urbVariable, color: 'var(--orange)'},
                 {name: 'Obra fija (PTAR, subestación…)', value: r.obraFija, color: 'var(--purple)'}], total) +
          meter('Urbanización / costo del proyecto', valid(r.urbanizacion) && valid(r.costoProyecto) && r.costoProyecto > 0 ? r.urbanizacion / r.costoProyecto : null,
            'escala 0–100% del costo', 'var(--red)', pct(valid(r.costoProyecto) && r.costoProyecto > 0 ? r.urbanizacion / r.costoProyecto : null));
      } else if (id === 'dCostos') {
        const fin = valid(r.interest) && valid(r.feeDebt) ? r.interest + r.feeDebt : null;
        const known = [r.urbanizacion, r.construccion, r.blandos, fin].filter(valid).reduce((a, b) => a + b, 0);
        const util = valid(r.utilidadFinal) ? r.utilidadFinal : null;
        const otros = valid(r.ingresos) ? r.ingresos - known - Math.max(0, util || 0) : null;
        html = '<div class="pm-chart-title">De cada peso vendido · ventas ' + money(r.ingresos) + '</div>' +
          stack([{name: 'Urbanización', value: r.urbanizacion, color: 'var(--orange)'},
                 {name: 'Construcción', value: r.construccion, color: 'var(--red)'},
                 {name: 'Blandos', value: r.blandos, color: 'var(--purple)'},
                 {name: 'Financieros', value: fin, color: 'var(--blue)'},
                 {name: 'Terreno y otros', value: valid(otros) && otros > r.ingresos * .005 ? otros : null, color: 'var(--suave)'},
                 {name: 'Utilidad', value: util !== null && util > 0 ? util : null, color: 'var(--green)'}], r.ingresos) +
          (util !== null && util < 0 ? '<div class="pm-warn"><i class="ti ti-alert-triangle"></i> Pérdida de ' + money(-util) + ': el costo rebasa las ventas</div>' : '');
      } else if (id === 'dCapital') {
        const months = r.totalMonths, peakAt = r.peakMonth;
        const mark = valid(months) && months > 0 && valid(peakAt) ? clamp01((peakAt - 1) / Math.max(1, months - 1)) * 100 : null;
        const stageEnd = valid(p.etapas) && valid(p.mesesUrbEtapa) && valid(months) && months > 0 ? clamp01(p.etapas * p.mesesUrbEtapa / months) * 100 : null;
        const sell = valid(p.inicioVentas) && valid(months) && months > 0 ? clamp01((p.inicioVentas - 1) / months) * 100 : null;
        html = '<div class="pm-chart-title">Calendario · ' + num(months) + ' meses</div>' +
          '<div class="pm-timeline" role="img" aria-label="Urbanización hasta el mes ' + num(valid(p.etapas) && valid(p.mesesUrbEtapa) ? p.etapas * p.mesesUrbEtapa : null) + ', ventas desde el mes ' + num(p.inicioVentas) + ', pico de deuda en el mes ' + num(peakAt) + '">' +
          (stageEnd !== null ? '<span class="pm-tl-urb" style="width:' + stageEnd.toFixed(1) + '%"></span>' : '') +
          (sell !== null ? '<span class="pm-tl-sell" style="left:' + sell.toFixed(1) + '%"></span>' : '') +
          (mark !== null && r.peak > 1 ? '<span class="pm-tl-peak" style="left:' + mark.toFixed(1) + '%"></span>' : '') + '</div>' +
          '<div class="pm-legend"><span><i style="background:var(--orange)"></i>Urbanización</span><span><i style="background:var(--green)"></i>Ventas desde mes ' + num(p.inicioVentas) + '</span>' +
          (r.peak > 1 ? '<span><i style="background:var(--purple)"></i>Pico mes ' + num(peakAt) + '</span>' : '<span>Sin deuda dispuesta</span>') + '</div>' +
          meter('Deuda pico / límite', valid(r.peak) && valid(r.debtCap) && r.debtCap > 0 ? r.peak / r.debtCap : null,
            'límite modelado ' + money(r.debtCap) + ', no es crédito autorizado', 'var(--purple)', money(r.peak));
      } else if (id === 'dAgua') {
        // Referencia propia del terreno: dotación recomendada NMX-R-046 de 1 l/s por hectárea (86.4 m³/día/ha).
        const ref = valid(r.superficie) && r.superficie > 0 ? r.superficie / 10000 * 86.4 : null;
        html = meter('Agua / dotación recomendada', valid(r.aguaDia) && ref ? r.aguaDia / ref : null,
            'referencia NMX 1 l/s/ha = ' + num(ref, 0) + ' m³/día para este terreno', 'var(--blue)', num(r.aguaDia, 1) + ' m³/día') +
          meter('Electricidad', valid(r.demandaKva) ? r.demandaKva / 10000 : null, 'escala 0–10 MVA', 'var(--orange)', num(valid(r.demandaKva) ? r.demandaKva / 1000 : null, 2) + ' MVA');
      }
      if (slot.dataset.markup !== html) { slot.innerHTML = html; slot.dataset.markup = html; }
    });
  }

  /* ---------- Tarjeta abierta: puntos + mini-tarjetas ---------- */
  function buildTopics(drawer) {
    if (drawer.dataset.pmTopics) return;
    const heads = [...drawer.querySelectorAll(':scope > .tema-head')];
    if (!heads.length) return;
    drawer.dataset.pmTopics = String(heads.length);
    drawer.classList.add('pm-drawer');

    const nav = document.createElement('nav');
    nav.className = 'pm-puntos';
    nav.setAttribute('aria-label', 'Qué quieres revisar');
    const hint = document.createElement('div');
    hint.className = 'pm-puntos-hint';
    hint.innerHTML = '<span>¿Qué quieres revisar?</span>';
    const all = document.createElement('button');
    all.type = 'button'; all.className = 'pm-all'; all.textContent = 'Abrir todo';
    hint.append(all);
    const grid = document.createElement('div');
    grid.className = 'pm-minigrid';

    heads[0].before(hint, nav, grid);
    const records = heads.map((head, i) => {
      const body = head._body || head.nextElementSibling;
      const title = head.querySelector('.tema-txt')?.textContent || head.textContent;
      const mini = document.createElement('section');
      mini.className = 'pm-mini';
      mini.id = drawer.id + '-pm' + i;
      mini.setAttribute('aria-label', title);
      grid.append(mini);
      mini.append(head, body); // Head stays right before its body: revelar() relies on it.
      head.title = title;
      head.querySelector('.tema-txt')?.setAttribute('data-full', title);
      const icon = document.createElement('i');
      icon.className = 'ti ' + topicIcon(title) + ' pm-head-icon';
      icon.setAttribute('aria-hidden', 'true');
      head.prepend(icon);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pm-chip';
      chip.setAttribute('aria-controls', mini.id);
      const n = body.querySelectorAll('.input-group').length;
      chip.innerHTML = '<i class="ti ' + topicIcon(title) + '" aria-hidden="true"></i><span>' + esc(shortLabel(title)) + '</span>' + (n ? '<small>' + n + '</small>' : '');
      chip.title = title;
      chip.addEventListener('click', e => {
        e.stopPropagation();
        const opening = !body.classList.contains('abierto');
        head.click();
        if (opening) requestAnimationFrame(() => mini.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}));
      });
      nav.append(chip);
      const sync = () => {
        const on = body.classList.contains('abierto');
        mini.classList.toggle('pm-on', on);
        chip.setAttribute('aria-pressed', String(on));
        const open = records.filter(x => x.body.classList.contains('abierto')).length;
        all.textContent = open === records.length ? 'Cerrar todo' : 'Abrir todo';
      };
      new MutationObserver(sync).observe(body, {attributes: true, attributeFilter: ['class']});
      return {head, body, mini, chip, sync};
    });
    records.forEach(r => r.sync());
    all.addEventListener('click', e => {
      e.stopPropagation();
      const openAll = records.some(x => !x.body.classList.contains('abierto'));
      records.forEach(x => { if (x.body.classList.contains('abierto') !== openAll) x.head.click(); });
    });
  }

  function mount() {
    if (mounted) return true;
    const cards = [...document.querySelectorAll('.card[data-card]')];
    if (!cards.length || !document.querySelector('.drawer .tema-head')) return false;
    mounted = true;
    document.body.classList.add('pm-ui');
    cards.forEach(card => {
      decorateKpis(card);
      const drawer = document.getElementById(card.dataset.card);
      if (drawer) buildTopics(drawer);
    });
    return true;
  }
  function update(r) {
    last = r || last;
    if (!mount() || !last) return;
    try { paintCharts(last); } catch (e) { console.warn('PPP tarjetas: gráfica sin pintar', e); }
  }
  if (typeof module === 'object' && module.exports) module.exports = {shortLabel, topicIcon};
  if (!root.document) return;
  root.PPPMacroCards = {update, mount};
  document.addEventListener('DOMContentLoaded', () => update());
})(typeof window === 'undefined' ? globalThis : window);
