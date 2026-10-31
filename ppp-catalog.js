/* Listas PPP: mismo contrato recurso=lista; sin datos persistidos ni escrituras. */
(() => {
  'use strict';
  const tipos = {
    macrolotes: {nombre: 'Macrolotes', pagina: 'macrolotes.html'},
    vertical: {nombre: 'Uso mixto', pagina: 'mixto.html'},
    unifamiliar: {nombre: 'Unifamiliar', pagina: 'unifamiliar.html'},
    residencial: {nombre: 'Lotes residenciales', pagina: 'residencial.html'},
    patrimonial: {nombre: 'Patrimonial', pagina: 'patrimonial.html'}
  };
  const button = document.getElementById('btnTodos'), list = document.getElementById('listaTodos');
  if (!button || !list) return;
  const count = document.getElementById('cntTodos');
  const home = !!document.querySelector('.projects-panel'), search = document.getElementById('projectSearch');
  const key = () => localStorage.getItem('pyod_clave_v1') || '';
  const TIMEOUT = 60000;   // tope de cada lectura de lista (en ambos caminos); las pruebas de navegador lo acortan para simular una tardanza
  // Un cargador (Fase 1): con YodCargador activo la lista sale de su transporte (caché-primero: pinta lo último y se refresca en fondo);
  // con ?cargador=legacy, o si no cargó, corre el fetch de siempre. Una lectura FRESCA (actualizar, reintentar) va siempre a red.
  const cargador = () => { const C = window.YodCargador; return C && C.v && !C.legacy ? C : null; };
  let credential = '', epoch = 0, states = {}, mapRows = {}, controllers = new Set();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const projectName = c => String(c.nombre_caso || c.palabra || 'Caso guardado').split(/\s+·\s+/)[0].trim();
  const normalized = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  function groups(rows) {
    const result = new Map(), seen = new Set();
    for (const row of rows) {
      const id = String(row.caso_id); if(seen.has(id))continue; seen.add(id);
      const name = projectName(row), k = normalized(name);
      if(!result.has(k))result.set(k,{name,rows:[]}); result.get(k).rows.push(row);
    }
    return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
  }
  function projectLink(pin){
    const info=tipos[pin?.tipo];if(!info||!pin.link)return null;
    try{
      const url=new URL(pin.link,location.href),expected=new URL(info.pagina,location.href);
      const origins=[location.origin,'https://alexpueblag.github.io','https://yodesarrollomx.github.io','https://tableros.yodesarrollo.mx'];
      const id=url.searchParams.get('open');
      if(!origins.includes(url.origin)||url.pathname!==expected.pathname||!id?.trim())return null;
      return {caso_id:id,nombre_caso:String(pin.nombre||'Caso del mapa'),_map:true};
    }catch(_){return null;}
  }
  function render() {
    let total=0,pending=0,failed=0,html='';
    for(const [type,info] of Object.entries(tipos)){
      if(!credential)continue;
      const state=states[type],loading=!state||state.status==='loading',error=state?.status==='error';
      if(loading)pending++;if(error)failed++;
      const rows=state?.status==='ok'?state.rows:state?.denied?[]:(mapRows[type]||[]);
      const projects=groups(rows); total+=projects.length;
      const query=normalized(search?.value.trim()||'');
      const visible=projects.filter(g=>normalized(g.rows.map(c=>[c.nombre_caso,c.palabra,c.estado].join(' ')).join(' ')).includes(query));
      html+=`<section class="lt-group" data-type="${type}"><h2 class="lt-tipo">${esc(info.nombre)} <span>${projects.length|| (loading?'…':'—')}</span></h2>`;
      if(loading||error){html+=`<p class="lt-category-status">${loading?'Consultando los proyectos guardados…':state.denied?'Consulta no disponible con esta sesión.':'No se confirmó la lista. Los accesos del mapa siguen disponibles.'}</p>`;}
      if(!loading&&!error&&!rows.length)html+='<p class="lt-category-status">Sin proyectos guardados.</p>';
      const link = (c, title) => {
        const detail = c._map ? 'Acceso del mapa · confirmar datos al abrir' : [String(c.nombre_caso||'').split(/\s+·\s+/).slice(1).join(' · '),c.estado, c.ts_actualizado ? 'Actualizado ' + String(c.ts_actualizado).split(/[T ]/)[0] : ''].filter(Boolean).join(' · ');
        return `<a class="lt-item" href="${info.pagina}?open=${esc(encodeURIComponent(String(c.caso_id)))}"><span class="lt-dot lt-${type}" aria-hidden="true"></span><span class="nm">${esc(title)}<span class="dt">${esc(detail)}</span></span><span class="ir" aria-hidden="true">→</span></a>`;
      };
      html+=visible.map(g=>g.rows.length===1 ? link(g.rows[0],g.name) :
        `<details class="lt-variants"><summary><span class="lt-dot lt-${type}" aria-hidden="true"></span><span class="nm">${esc(g.name)}<span class="dt">${g.rows.length} registros · ver alternativas</span></span></summary>${g.rows.map(c=>link(c,String(c.nombre_caso).split(/\s+·\s+/).slice(1).join(' · ')||c.palabra||'Alternativa guardada')).join('')}</details>`).join('');
      if(query&&!visible.length&&projects.length)html+='<p class="lt-category-status">Sin coincidencias.</p>';
      if(error&&!state.denied)html+=`<button class="lt-retry-type" type="button" data-retry="${type}">Reintentar ${esc(info.nombre)}</button>`;
      html+='</section>';
    }
    const incomplete=pending||failed;
    count.textContent=incomplete?(total?total+'+':'…'):String(total);
    count.setAttribute('aria-label',incomplete?'Listado incompleto':total+' proyectos guardados');
    let status='';if(pending)status=`Cargando ${pending} de 5 listas…`;if(failed)status+=`${status?' ':''}No se pudieron consultar ${failed} de 5 listas.`;
    if(!credential)status='Entra con tu sesión para consultar los proyectos guardados.';
    if(!incomplete&&credential&&!total)status='Aún no hay proyectos guardados.';
    const scroll=list.scrollTop;
    // Feedback stays above the scrollable project groups rather than disappearing below them.
    list.innerHTML=(status?`<div class="lt-feedback"><p class="lt-status" role="status">${status}</p>${failed?'<button class="lt-retry" type="button">Reintentar listas pendientes</button>':''}</div>`:'')+html;
    list.scrollTop=scroll;list.setAttribute('aria-busy',pending&&credential?'true':'false');
    const retry=list.querySelector('.lt-retry');if(retry)retry.onclick=()=>load(key(),true);
    list.querySelectorAll('[data-retry]').forEach(b=>b.onclick=()=>load(key(),true,b.dataset.retry));
    dispatchEvent(new Event('ppp:catalog-render'));
  }
  // Lo que se exige a una respuesta de lista; el mismo criterio para la red, la caché y los refrescos de fondo.
  function rowsOf(data) {
    if(data.ok!==true||!Array.isArray(data.casos)){const error=new Error('lista');error.denied=/^(clave|board|acceso|sesion|revocada|permiso)$/.test(data.error||'');throw error;}
    // Un registro mal formado no se declara como una lista vacía.
    if (data.casos.some(c => !c || c.caso_id === null || c.caso_id === undefined || String(c.caso_id) === '')) throw new Error('registro');
    return data.casos;
  }
  async function read(type, session, generation, fresh) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const endpoint = (window.YOD_PORTERO || {}).original;
      if (!endpoint) throw new Error('endpoint');
      const query = new URLSearchParams({recurso: 'lista', tipo: type, k: session});
      const direct = async () => {
        const response = await fetch(endpoint + '?' + query, {signal: controller.signal});
        if (!response.ok) throw new Error('http');
        return response.json();
      };
      const C = fresh ? null : cargador();
      let data, cached = false;
      if (C) {
        // El tope de la pantalla manda también sobre los reintentos del cargador: se corta a TIMEOUT en total.
        const stop = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout'))));
        const response = await Promise.race([C.ppp.get(endpoint, {k: session, recurso: 'lista', tipo: type}, {recurso: 'lista', timeoutMs: TIMEOUT}), stop]);
        if (!response.ok) throw new Error('http');
        cached = !!(response.yod && response.yod.origen && response.yod.origen !== 'red');
        data = await response.json();
        // Una copia guardada que esta pantalla no aceptaría no manda: se vuelve a pedir a red.
        if (cached) { try { rowsOf(data); } catch (_) { cached = false; data = await direct(); } }
      } else data = await direct();
      const rows = rowsOf(data);
      if (generation !== epoch || session !== credential || session !== key()) return;
      states[type] = {status: 'ok', rows, cached};
    } catch (e) {
      if (generation !== epoch || session !== credential || session !== key()) return;
      states[type] = {status: 'error', rows: [],denied:!!e.denied||!!states[type]?.denied};
    } finally {
      clearTimeout(timer); controllers.delete(controller);
      if (generation === epoch && session === credential && session === key()) render();
    }
  }
  // Lo pintado desde caché se actualiza cuando el cargador trae la respuesta fresca; un rechazo de acceso retira las filas viejas,
  // cualquier otro fallo del refresco las deja como están.
  if (cargador()) addEventListener('yodcargador:dato', e => {
    const detail = (e && e.detail) || {}, name = String(detail.clave || '');
    const type = detail.origen === 'red' && /lista/.test(name) ? Object.keys(tipos).find(t => name.includes(t)) : null;
    if (!type || !credential || credential !== key() || !states[type] || states[type].status !== 'ok' || !states[type].cached) return;
    try { states[type] = {status: 'ok', rows: rowsOf(detail.data), cached: false}; }
    catch (error) { if (!error.denied) return; states[type] = {status: 'error', rows: [], denied: true}; }
    render();
  });
  function load(session, retry = false, onlyType, refresh = false) {
    if (!session) {
      epoch++; controllers.forEach(c => c.abort()); controllers.clear();
      credential = ''; states = {};mapRows={}; render(); return;
    }
    if (session === credential && !retry) return;
    if (session !== credential || refresh) {
      epoch++; controllers.forEach(c => c.abort()); controllers.clear();
      if(session !== credential){states = {};mapRows={};}
    }
    credential = session;
    const generation = epoch;
    const requests = Object.keys(tipos).filter(t => (!onlyType||t===onlyType)&&(refresh || !states[t] || states[t].status === 'error'));
    requests.forEach(t => states[t] = {status: 'loading', rows: [],denied:!!states[t]?.denied}); render();
    requests.forEach(t => { void read(t, session, generation, retry || refresh); });
  }
  if(search)search.addEventListener('input',render);
  button.setAttribute('aria-expanded', String(home)); button.setAttribute('aria-controls', list.id);
  if(home)button.setAttribute('aria-label','Actualizar proyectos guardados');
  list.hidden = !home;
  button.onclick = () => {
    if(home){load(key(),true,undefined,true);dispatchEvent(new Event('ppp:refresh'));return;}
    list.hidden = !list.hidden;
    button.setAttribute('aria-expanded', String(!list.hidden));
    if (!list.hidden) load(key());
  };
  // El panel recibe el gesto, no Leaflet (drag, zoom o doble toque).
  const panel = button.closest('.panel');
  if (window.L && panel) { L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel); }
  addEventListener('storage', e => { if (e.key === 'pyod_clave_v1' || e.key === null) load(key()); });
  window.PPPCatalog={load,projectLink,mapData(session,pins){
    if(session!==key())return;load(session);if(session!==credential)return;
    mapRows={};for(const pin of Array.isArray(pins)?pins:[]){const row=projectLink(pin);if(!row)continue;const group=mapRows[pin.tipo]||(mapRows[pin.tipo]=[]);if(!group.some(c=>c.caso_id===row.caso_id))group.push(row);}
    render();
  }};
  load(key());dispatchEvent(new Event('ppp:catalog-ready'));
})();
