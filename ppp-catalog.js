/* Listas PPP: mismo contrato recurso=lista; sin datos persistidos ni escrituras. */
(() => {
  'use strict';
  const tipos = {
    macrolotes: {nombre: 'Macro Lotes', pagina: 'macrolotes.html'},
    vertical: {nombre: 'Mixto / Depas', pagina: 'mixto.html'},
    unifamiliar: {nombre: 'Unifamiliar', pagina: 'unifamiliar.html'},
    residencial: {nombre: 'Lotes Residenciales', pagina: 'residencial.html'},
    patrimonial: {nombre: 'Patrimonial / Rentas', pagina: 'patrimonial.html'}
  };
  const button = document.getElementById('btnTodos'), list = document.getElementById('listaTodos');
  if (!button || !list) return;
  const count = document.getElementById('cntTodos');
  const key = () => localStorage.getItem('pyod_clave_v1') || '';
  let credential = '', epoch = 0, states = {}, controllers = new Set();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
  function render() {
    let total = 0, pending = 0, failed = 0, html = '';
    for (const [type, info] of Object.entries(tipos)) {
      const state = states[type];
      if (!state || state.status === 'loading') { pending++; continue; }
      if (state.status === 'error') { failed++; continue; }
      total += state.rows.length;
      if (!state.rows.length) continue;
      html += `<section class="lt-group"><h2 class="lt-tipo">${esc(info.nombre)} <span>${state.rows.length}</span></h2>`;
      html += state.rows.map(c => {
        const profit = finite(c.utilidad) ? (Number(c.utilidad) < 0 ? '−$' : '$') + Math.abs(Number(c.utilidad) / 1e6).toFixed(1) + ' M' : '';
        const detail = [c.palabra, profit, c.estado].filter(Boolean).map(esc).join(' · ');
        return `<a class="lt-item" href="${info.pagina}?open=${esc(encodeURIComponent(String(c.caso_id)))}"><span class="lt-dot lt-${type}" aria-hidden="true"></span><span class="nm">${esc(c.nombre_caso || c.palabra || 'Caso guardado')}<span class="dt">${detail}</span></span><span class="ir" aria-hidden="true">→</span></a>`;
      }).join('') + '</section>';
    }
    const incomplete = pending || failed;
    count.textContent = incomplete ? (total ? total + '+' : '…') : String(total);
    count.setAttribute('aria-label', incomplete ? 'Listado incompleto' : total + ' casos guardados');
    let status = '';
    if (pending) status = `Cargando ${pending} de 5 listas…`;
    if (failed) status += `${status ? ' ' : ''}No se pudieron consultar ${failed} de 5 listas.`;
    if (!credential) status = 'Entra con tu sesión para consultar los casos guardados.';
    if (!incomplete && credential && !total) status = 'Aún no hay casos guardados.';
    const scroll = list.scrollTop;
    list.innerHTML = html + (status ? `<p class="lt-status" role="status">${status}</p>` : '') + (failed ? '<button class="lt-retry" type="button">Reintentar listas pendientes</button>' : '');
    list.scrollTop = scroll;
    list.setAttribute('aria-busy', pending && credential ? 'true' : 'false');
    const retry = list.querySelector('.lt-retry');
    if (retry) retry.onclick = () => load(key(), true);
  }
  async function read(type, session, generation) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const endpoint = (window.YOD_PORTERO || {}).original;
      if (!endpoint) throw new Error('endpoint');
      const query = new URLSearchParams({recurso: 'lista', tipo: type, k: session});
      const response = await fetch(endpoint + '?' + query, {signal: controller.signal});
      if (!response.ok) throw new Error('http');
      const data = await response.json();
      if (data.ok !== true || !Array.isArray(data.casos)) throw new Error('lista');
      // Un registro mal formado no se declara como una lista vacía.
      if (data.casos.some(c => !c || c.caso_id === null || c.caso_id === undefined || String(c.caso_id) === '')) throw new Error('registro');
      if (generation !== epoch || session !== credential || session !== key()) return;
      states[type] = {status: 'ok', rows: data.casos};
    } catch (e) {
      if (generation !== epoch || session !== credential || session !== key()) return;
      states[type] = {status: 'error', rows: []};
    } finally {
      clearTimeout(timer); controllers.delete(controller);
      if (generation === epoch && session === credential && session === key()) render();
    }
  }
  function load(session, retry = false) {
    if (!session) {
      epoch++; controllers.forEach(c => c.abort()); controllers.clear();
      credential = ''; states = {}; render(); return;
    }
    if (session === credential && !retry) return;
    if (session !== credential) {
      epoch++; controllers.forEach(c => c.abort()); controllers.clear(); states = {};
    }
    credential = session;
    const generation = epoch;
    const requests = Object.keys(tipos).filter(t => !states[t] || states[t].status === 'error');
    requests.forEach(t => states[t] = {status: 'loading', rows: []}); render();
    requests.forEach(t => { void read(t, session, generation); });
  }
  button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', list.id);
  list.hidden = true;
  button.onclick = () => {
    list.hidden = !list.hidden;
    button.setAttribute('aria-expanded', String(!list.hidden));
    if (!list.hidden) load(key());
  };
  // El panel recibe el gesto, no Leaflet (drag, zoom o doble toque).
  const panel = button.closest('.panel');
  if (window.L && panel) { L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel); }
  addEventListener('storage', e => { if (e.key === 'pyod_clave_v1' || e.key === null) load(key()); });
  window.PPPCatalog = {load};
  load(key());
})();
