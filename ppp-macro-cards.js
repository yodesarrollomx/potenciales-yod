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
  const TOPIC_ICONS = [
    [/geometr/i, 'ti-dimensions'], [/cuadro de áreas|reparto/i, 'ti-chart-pie'], [/^producto/i, 'ti-box'],
    [/precio/i, 'ti-tag'], [/vivienda/i, 'ti-home'], [/estrategia/i, 'ti-route'], [/partidas/i, 'ti-backhoe'],
    [/redes/i, 'ti-topology-star'], [/obra fija/i, 'ti-tool'], [/norma/i, 'ti-certificate'], [/construcci/i, 'ti-crane'],
    [/blandos/i, 'ti-file-invoice'], [/terreno/i, 'ti-map-pin'], [/calendario|absorci/i, 'ti-calendar-time'],
    [/cobro/i, 'ti-cash'], [/financ/i, 'ti-building-bank'], [/candado/i, 'ti-lock'], [/dotaci/i, 'ti-droplets'],
    [/giro/i, 'ti-building-warehouse'], [/cuadro de agua/i, 'ti-droplet'], [/pluvial/i, 'ti-cloud-rain'], [/vial/i, 'ti-car'],
    [/estacionamiento/i, 'ti-parking'], [/sanitario|ptar|residuos/i, 'ti-recycle'], [/eléctric|cargas/i, 'ti-bolt'], [/demograf/i, 'ti-users']
  ];
  const topicIcon = t => (TOPIC_ICONS.find(([re]) => re.test(t)) || [0, 'ti-point'])[1];
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

  /* Resumen de cada tarjeta en la lista de decisiones. */
  const CARD_SUMMARY = {
    dTerreno: r => num(valid(r.superficie) ? r.superficie / 10000 : null, 1) + ' ha · ' + pct(r.vendiblePct) + ' vendible',
    dMezcla: r => money(r.ingresos) + ' en ventas',
    dUrb: r => money(r.urbanizacion),
    dCostos: r => money(r.costoProyecto) + ' costo total',
    dCapital: r => num(r.totalMonths) + ' meses' + (r.peak > 1 ? ' · deuda ' + money(r.peak) : ''),
    dAgua: r => num(r.aguaDia, 0) + ' m³/día · ' + (valid(r.demandaKva) ? num(r.demandaKva / 1000, 1) + ' MVA' : '—')
  };
  const CARD_TITLES = {dTerreno: 'Terreno y áreas', dMezcla: 'Producto e ingresos', dUrb: 'Urbanización',
    dCostos: 'Naves y gastos blandos', dCapital: 'Capital y calendario', dAgua: 'Servicios'};

  const $ = id => document.getElementById(id);
  const valueOf = id => $(id) ? Number($(id).value) : null;
  const shown = id => (document.querySelector('.val-display[data-input="' + id + '"]')?.textContent || '').trim();
  /* Resumen de sección: plantillas para las clave; si no, las dos primeras filas. */
  const SECTION_SUMMARY = [
    [/geometr/i, () => shown('inFrente') + ' × ' + shown('inFondo') + ' m · vialidad ' + shown('inAnchoVialidad') + ' m'],
    [/cuadro de áreas/i, () => { const s = ['inPctVialidades','inPctBanquetas','inPctVerdes','inPctEquipamiento','inPctRetencion','inPctDDV'].map(valueOf).reduce((a, b) => a + (b || 0), 0); return 'cesiones ' + num(s) + '% · vendible ' + num(100 - s) + '%'; }],
    [/reparto del área vendible/i, () => { const s = ['inMixNaves','inMixMacro','inMixCom','inMixViv'].map(valueOf).reduce((a, b) => a + (b || 0), 0); return {text: 'naves ' + shown('inMixNaves') + ' · macro ' + shown('inMixMacro') + ' · suma ' + num(s) + '%', warn: Math.abs(s - 100) > .5}; }]
  ];

  let mounted = false, last = null;
  const cards = [];

  /* ---------- Gráfica por tarjeta (dentro de la tarjeta abierta) ---------- */
  const CHART_CARDS = ['dUrb', 'dCostos', 'dCapital', 'dAgua'];
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
    const sum = document.createElement('span'); sum.className = 'pm-sum';
    const dot = document.createElement('i'); dot.className = 'pm-alert-dot'; dot.hidden = true; dot.setAttribute('aria-hidden', 'true');
    const chev = document.createElement('i'); chev.className = 'ti ti-chevron-right pm-chev'; chev.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.className = 'pm-cardtext';
    if (titleEl) { titleEl.before(text); text.append(titleEl); }
    const sub = document.createElement('span'); sub.className = 'pm-cardsub'; sub.append(dot, sum); text.append(sub);
    header.append(chev);
    header.setAttribute('role', 'button'); header.tabIndex = 0;
    header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
    // Franja de resultado: hasta 3 cifras tomadas de los mismos datos de la tarjeta.
    const strip = document.createElement('div'); strip.className = 'pm-strip';
    const boxes = [...card.querySelectorAll(':scope > .kpi-grid .kpi-box')].filter(b => b.querySelector('.kpi-val'));
    header.after(strip);
    let chart = null;
    if (CHART_CARDS.includes(id)) { chart = document.createElement('div'); chart.className = 'pm-chart'; strip.after(chart); }
    [strip, chart].forEach(el => el && el.addEventListener('click', e => e.stopPropagation())); // solo el encabezado abre/cierra
    const rec = {id, card, header, sum, dot, strip, boxes: boxes.slice(0, 3), chart, drawer};
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
      head.innerHTML = '<i class="ti ' + topicIcon(raw) + ' pm-secicon" aria-hidden="true"></i><span class="pm-sectext"><span class="tema-txt">' + esc(title) + '</span><span class="pm-secsum"></span></span><span class="tema-n" hidden></span><i class="ti ti-chevron-right pm-chev" aria-hidden="true"></i>';
      if (note) { const n = document.createElement('p'); n.className = 'pm-secnote'; n.textContent = note.charAt(0).toUpperCase() + note.slice(1); body.querySelector('.tema-inner').prepend(n); }
      if (body.classList.contains('abierto')) head.click(); // la lista arranca cerrada
      const rows = [...body.querySelectorAll('.input-group')].map(g => buildRow(g, drawer)).filter(Boolean);
      return {head, body, raw, rows, sumEl: head.querySelector('.pm-secsum')};
    });
  }
  function buildRow(group, drawer) {
    const input = group.querySelector('input[type=range]'), header = group.querySelector('.input-header');
    if (!input || !header || group.dataset.pmRow) return null;
    group.dataset.pmRow = '1'; group.classList.add('pm-row');
    const label = header.querySelector('label');
    const {label: short, help} = splitLabel(label?.textContent);
    if (label) { label.dataset.full = label.textContent; label.textContent = short; label.title = label.dataset.full; }
    const dot = document.createElement('i'); dot.className = 'pm-changed'; dot.title = 'Distinto al valor de referencia'; dot.hidden = true;
    (label?.parentElement === header ? label : label?.parentElement || header.firstChild).after(dot);
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
    let sw = null;
    if (binary) {
      group.classList.add('pm-binary');
      sw = document.createElement('button'); sw.type = 'button'; sw.className = 'pm-switch'; sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-label', short);
      header.append(sw);
      sw.addEventListener('click', e => { e.stopPropagation(); input.value = input.value === '1' ? '0' : '1'; input.dispatchEvent(new Event('input', {bubbles: true})); });
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
    return {group, input, dot, sw, label: short};
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
  function paint(r) {
    const p = r.p || {};
    const gate = p.gateAgua, blocked = gate === 0;
    cards.forEach(c => {
      c.sum.textContent = CARD_SUMMARY[c.id] ? CARD_SUMMARY[c.id](r) : '';
      c.dot.hidden = !(c.id === 'dAgua' && blocked);
      const strip = c.boxes.map(b => '<div class="pm-fig"><span>' + esc(b.querySelector('.kpi-lbl')?.textContent || '') + '</span><b class="' + esc(b.querySelector('.kpi-val').className.replace('kpi-val', '').trim()) + '">' + esc(b.querySelector('.kpi-val').textContent) + '</b></div>').join('');
      if (c.strip.dataset.m !== strip) { c.strip.innerHTML = strip; c.strip.dataset.m = strip; }
      if (c.chart) { const h = chartHtml(c.id, r); if (c.chart.dataset.m !== h) { c.chart.innerHTML = h; c.chart.dataset.m = h; } }
      (c.sections || []).forEach(s => {
        const tpl = SECTION_SUMMARY.find(([re]) => re.test(s.raw));
        let text = '', warn = false;
        if (tpl) { const out = tpl[1](); if (typeof out === 'object') { text = out.text; warn = out.warn; } else text = out; }
        else if (s.rows.length) text = s.rows.slice(0, 2).map(x => x.label + ' ' + shown(x.input.id)).join(' · ');
        else { const act = s.body.querySelector('.active b,.active'); text = act ? act.textContent.trim() : 'Elegir opción'; }
        const changed = s.rows.filter(x => Number(x.input.value) !== Number(x.input.defaultValue)).length;
        s.rows.forEach(x => { x.dot.hidden = Number(x.input.value) === Number(x.input.defaultValue); if (x.sw) x.sw.setAttribute('aria-checked', String(x.input.value === '1')); });
        if (changed) text += ' · ' + changed + (changed === 1 ? ' ajustado' : ' ajustados');
        s.sumEl.textContent = text; s.sumEl.classList.toggle('pm-warn-text', !!warn);
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
