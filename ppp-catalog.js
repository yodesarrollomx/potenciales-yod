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
  let credential = '', epoch = 0, states = {}, mapRows = {}, controllers = new Set();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
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
      total+=rows.length;
      html+=`<section class="lt-group" data-type="${type}"><h2 class="lt-tipo">${esc(info.nombre)} <span>${rows.length|| (loading?'…':'—')}</span></h2>`;
      if(loading||error){html+=`<p class="lt-category-status">${loading?'Consultando los casos guardados…':state.denied?'Consulta no disponible con esta sesión.':'No se confirmó la lista. Los accesos del mapa siguen disponibles.'}</p>`;}
      if(!loading&&!error&&!rows.length)html+='<p class="lt-category-status">Sin casos guardados.</p>';
      html+=rows.map(c=>{
        const profit=finite(c.utilidad)?(Number(c.utilidad)<0?'−$':'$')+Math.abs(Number(c.utilidad)/1e6).toFixed(1)+' M':'';
        const detail=c._map?'Acceso del mapa · confirmar datos al abrir':[c.palabra,profit,c.estado].filter(Boolean).map(esc).join(' · ');
        return `<a class="lt-item" href="${info.pagina}?open=${esc(encodeURIComponent(String(c.caso_id)))}"><span class="lt-dot lt-${type}" aria-hidden="true"></span><span class="nm">${esc(c.nombre_caso||c.palabra||'Caso guardado')}<span class="dt">${detail}</span></span><span class="ir" aria-hidden="true">→</span></a>`;
      }).join('');
      if(error&&!state.denied)html+=`<button class="lt-retry-type" type="button" data-retry="${type}">Reintentar ${esc(info.nombre)}</button>`;
      html+='</section>';
    }
    const incomplete=pending||failed;
    count.textContent=incomplete?(total?total+'+':'…'):String(total);
    count.setAttribute('aria-label',incomplete?'Listado incompleto':total+' casos guardados');
    let status='';if(pending)status=`Cargando ${pending} de 5 listas…`;if(failed)status+=`${status?' ':''}No se pudieron consultar ${failed} de 5 listas.`;
    if(!credential)status='Entra con tu sesión para consultar los casos guardados.';
    if(!incomplete&&credential&&!total)status='Aún no hay casos guardados.';
    const scroll=list.scrollTop;
    // Feedback stays above the scrollable project groups rather than disappearing below them.
    list.innerHTML=(status?`<div class="lt-feedback"><p class="lt-status" role="status">${status}</p>${failed?'<button class="lt-retry" type="button">Reintentar listas pendientes</button>':''}</div>`:'')+html;
    list.scrollTop=scroll;list.setAttribute('aria-busy',pending&&credential?'true':'false');
    const retry=list.querySelector('.lt-retry');if(retry)retry.onclick=()=>load(key(),true);
    list.querySelectorAll('[data-retry]').forEach(b=>b.onclick=()=>load(key(),true,b.dataset.retry));
  }
  async function read(type, session, generation) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const endpoint = (window.YOD_PORTERO || {}).original;
      if (!endpoint) throw new Error('endpoint');
      const query = new URLSearchParams({recurso: 'lista', tipo: type, k: session});
      const response = await fetch(endpoint + '?' + query, {signal: controller.signal});
      if (!response.ok) throw new Error('http');
      const data = await response.json();
      if(data.ok!==true||!Array.isArray(data.casos)){const error=new Error('lista');error.denied=/^(clave|board|acceso|sesion|revocada|permiso)$/.test(data.error||'');throw error;}
      // Un registro mal formado no se declara como una lista vacía.
      if (data.casos.some(c => !c || c.caso_id === null || c.caso_id === undefined || String(c.caso_id) === '')) throw new Error('registro');
      if (generation !== epoch || session !== credential || session !== key()) return;
      states[type] = {status: 'ok', rows: data.casos};
    } catch (e) {
      if (generation !== epoch || session !== credential || session !== key()) return;
      states[type] = {status: 'error', rows: [],denied:!!e.denied};
    } finally {
      clearTimeout(timer); controllers.delete(controller);
      if (generation === epoch && session === credential && session === key()) render();
    }
  }
  function load(session, retry = false, onlyType) {
    if (!session) {
      epoch++; controllers.forEach(c => c.abort()); controllers.clear();
      credential = ''; states = {};mapRows={}; render(); return;
    }
    if (session === credential && !retry) return;
    if (session !== credential) {
      epoch++; controllers.forEach(c => c.abort()); controllers.clear(); states = {};mapRows={};
    }
    credential = session;
    const generation = epoch;
    const requests = Object.keys(tipos).filter(t => (!onlyType||t===onlyType)&&(!states[t] || states[t].status === 'error'));
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
  window.PPPCatalog={load,projectLink,mapData(session,pins){
    if(session!==key())return;load(session);if(session!==credential)return;
    mapRows={};for(const pin of Array.isArray(pins)?pins:[]){const row=projectLink(pin);if(!row)continue;const group=mapRows[pin.tipo]||(mapRows[pin.tipo]=[]);if(!group.some(c=>c.caso_id===row.caso_id))group.push(row);}
    render();
  }};
  load(key());dispatchEvent(new Event('ppp:catalog-ready'));
})();
