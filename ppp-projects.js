/* Read-only projection of existing, authorized project dossiers. No financial engine. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.PPPProjects=api;api.mount(root);}})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeLink(value){try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
  function validate(s){
    if(!s||s.contract!=='brokers.v1'||!s.actor?.id||!['broker','direccion'].includes(s.actor.role)||!Number.isInteger(s.revision))throw Error('contract');
    for(const k of ['brokers','contacts','opportunities','activities','participations'])if(!Array.isArray(s[k])||s[k].some(r=>!r||typeof r.id!=='string')||new Set(s[k].map(r=>r.id)).size!==s[k].length)throw Error('contract');
    if(s.actor.role==='broker'){
      const owns=r=>Array.isArray(r.broker_ids)&&r.broker_ids.includes(s.actor.id),ids=new Set(s.opportunities.map(r=>r.id));
      if(s.opportunities.some(r=>!owns(r))||s.contacts.some(r=>!owns(r))||s.brokers.some(r=>r.id!==s.actor.id)||s.activities.some(r=>!ids.has(r.opportunity_id))||s.participations.some(r=>r.broker_id!==s.actor.id||!ids.has(r.opportunity_id)))throw Error('scope');
    }
    return s;
  }
  function activityMeta(value){const m=String(value||'').match(/\[YOD-CRM v1\]\s*(\{[^\n]*\})/);try{return m?JSON.parse(m[1]):{};}catch(_){return {};}}
  const clean=value=>String(value||'').replace(/\[(?:YOD-CRM|YOD-CASE) v1\]\s*\{[^\n]*\}/g,'').trim();
  const date=value=>{const v=String(value||'');return /^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):'';};
  function history(s,id){return s.activities.filter(a=>a.opportunity_id===id).map(a=>({...a,meta:activityMeta(a.note)})).sort((a,b)=>String(b.meta.occurred_at||'').localeCompare(String(a.meta.occurred_at||''))||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));}
  function content(s,o){
    const events=history(s,o.id),last=events[0],next=String(o.next_action||'').replace(/^\[(?:Persona:[^\]]+|YOD|PG|Masterbroker)\]\s*/,'');
    const anchor=(url,label)=>safeLink(url)?`<a href="${esc(safeLink(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
    const links=[anchor(o.ppp_url,'Abrir plan guardado'),anchor(o.documents_url,'Documentos del expediente'),anchor(o.project_url,'Presentación')].filter(Boolean).join('');
    const para=v=>`<p>${esc(v).replace(/\n/g,'<br>')}</p>`;
    return `<div class="dossier-body">${last?`<h3>Último movimiento${date(last.meta.occurred_at)?' · '+esc(date(last.meta.occurred_at)):''}</h3>${para(clean(last.note))}`:''}${next?`<h3>Siguiente paso${date(o.next_date)?' · '+esc(date(o.next_date)):''}</h3>${para(next)}`:''}${o.location?`<h3>Ubicación</h3>${para(o.location)}`:''}${links?`<nav class="dossier-links" aria-label="Documentos del proyecto">${links}</nav>`:''}${o.notes?`<details><summary>Datos y antecedentes</summary>${para(clean(o.notes))}</details>`:''}${events.length?`<details><summary>Historial · ${events.length} movimientos</summary><ol>${events.map(a=>`<li><strong>${esc(date(a.meta.occurred_at)||'Fecha del hecho por confirmar')}</strong>${para(clean(a.note))}${anchor(a.meta.source_url,a.meta.source||'Fuente')}</li>`).join('')}</ol></details>`:''}<p class="dossier-revision">Última revisión registrada: ${esc(date(o.last_review||o.updated_at)||'Por confirmar')}</p></div>`;
  }
  function createReader({url,fetch,getCredential,onState,schedule=setTimeout,cancel=clearTimeout}){
    let epoch=0,controller=null;
    const reset=()=>{epoch++;controller?.abort();controller=null;onState({status:'empty',snapshot:null});};
    async function load(){reset();const session=getCredential();if(!session)return;const own=epoch;controller=new AbortController();const active=controller;
      onState({status:'loading',snapshot:null});const timer=schedule(()=>active.abort(),25000);
      try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'brokers_snapshot',k:session,data:{}}),signal:active.signal,cache:'no-store',credentials:'omit'});
        if(!response.ok)throw Error('unavailable');const json=await response.json();if(json.ok!==true)throw Error(['forbidden','unauthorized','broker_not_linked'].includes(json.error)?'access':'unavailable');
        const snapshot=validate(json.data);if(own!==epoch||session!==getCredential())return;onState({status:'ready',snapshot});
      }catch(error){if(own!==epoch||session!==getCredential())return;onState({status:error.message==='access'?'access':'error',snapshot:null});}finally{cancel(timer);if(controller===active)controller=null;}
    }
    return {load,reset};
  }
  function mount(root){
    const box=root.document.getElementById('projectDossiers');if(!box)return;
    const search=root.document.getElementById('projectSearch'),getCredential=()=>root.localStorage.getItem('pyod_clave_v1')||'';
    let snapshot=null,session='',status='empty',lastLoad=0,focused=false;
    const target=new URLSearchParams(root.location.search).get('project');
    function clearDecorations(){root.document.querySelectorAll('[data-project-context]').forEach(e=>e.remove());}
    function render(){
      const opened=new Set([...root.document.querySelectorAll('[data-project-context][open]')].map(e=>e.dataset.projectContext));
      clearDecorations();if(!getCredential()||session!==getCredential()){box.replaceChildren();return;}
      if(!snapshot){const messages={loading:'Consultando los expedientes recientes…',access:'Los expedientes de cartera no están disponibles con esta sesión.',error:'No se pudieron consultar los expedientes recientes.'};box.innerHTML=messages[status]?`<p class="lt-status" role="status">${messages[status]}</p>${status==='error'?'<button class="lt-retry" type="button" data-dossier-retry>Reintentar expedientes</button>':''}`:'';box.querySelector('[data-dossier-retry]')?.addEventListener('click',reload);return;}
      const query=String(search?.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
      const shown=new Set();root.document.querySelectorAll('#listaTodos .lt-item').forEach(link=>{
        let id;try{id=new URL(link.getAttribute('href'),root.location.href).searchParams.get('open');}catch(_){return;}
        const o=snapshot.opportunities.find(o=>o.ppp_id&&o.ppp_id===id);if(!o)return;shown.add(o.id);
        const detail=root.document.createElement('details');detail.className='dossier-context';detail.setAttribute('data-project-context',o.id);detail.innerHTML='<summary>Situación y antecedentes</summary>'+content(snapshot,o);link.after(detail);
      });
      const rows=snapshot.opportunities.filter(o=>!shown.has(o.id)).filter(o=>[o.title,o.location,o.notes].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').includes(query));
      box.innerHTML=`<h2 class="serif">Expedientes y análisis previos</h2><div class="dossier-grid">${rows.map(o=>`<details class="project-dossier" data-project-context="${esc(o.id)}"><summary><span><strong>${esc(o.title)}</strong><small>${esc(o.stage||'En preparación')}${o.ppp_id?' · Con plan vinculado':' · Análisis previo'}</small></span><span aria-hidden="true">+</span></summary>${content(snapshot,o)}</details>`).join('')}</div>${!rows.length&&query?'<p class="lt-status">Sin coincidencias en los expedientes previos.</p>':''}`;
      root.document.querySelectorAll('[data-project-context]').forEach(e=>{if(opened.has(e.dataset.projectContext)||e.dataset.projectContext===target)e.open=true;if(!focused&&e.dataset.projectContext===target){focused=true;e.scrollIntoView({block:'start'});}});
    }
    const reader=createReader({url:box.dataset.endpoint,fetch:root.fetch.bind(root),getCredential,onState(state){status=state.status;snapshot=state.snapshot;session=getCredential();render();}});
    function reload(){lastLoad=Date.now();return reader.load();}
    root.addEventListener('storage',e=>{if(e.key==='pyod_clave_v1'||e.key===null)void reload();});
    root.addEventListener('ppp:catalog-render',render);root.addEventListener('ppp:refresh',()=>void reload());search?.addEventListener('input',render);
    root.document.addEventListener('visibilitychange',()=>{if(root.document.visibilityState==='visible'&&Date.now()-lastLoad>60000)void reload();});
    void reload();return {reload};
  }
  return {validate,history,content,safeLink,createReader,mount};
});
