/* PPP4 entry inside the existing vertical board. No local seed persistence. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PPP40Bootstrap=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SESSION_KEY='pyod_clave_v1';
  function selected(href){
    const p=new URL(href).searchParams;
    return p.get('ppp4')==='1'||p.has('seed')||p.has('ppp40_op');
  }
  function createAdapter({endpoint,getIdentity,fetchImpl,timeoutMs=30000}){
    const url=new URL(endpoint);
    if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)||url.search||url.hash)throw new Error('invalid_existing_endpoint');
    async function request(method,values){
      const identity=getIdentity();
      if(!identity)throw new Error('session_required');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const target=new URL(endpoint);
        const options={method,credentials:'omit',redirect:'follow',signal:controller.signal,cache:'no-store'};
        if(method==='GET'){
          const query={...values,k:identity,recurso:'ppp40-seed'};
          for(const [key,value]of Object.entries(query))if(value!==undefined&&value!==null)target.searchParams.set(key,String(value));
        }else{
          options.headers={'Content-Type':'text/plain;charset=utf-8'};
          options.body=JSON.stringify({...values,k:identity,tipo:'ppp40-seed'});
        }
        const response=await fetchImpl(target.toString(),options);
        if(identity!==getIdentity())throw new Error('session_changed');
        if(!response.ok)throw new Error('transport_failed');
        const data=await response.json();
        if(identity!==getIdentity())throw new Error('session_changed');
        if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('invalid_response');
        return data;
      }finally{clearTimeout(timer);}
    }
    return {read:values=>request('GET',values),save:values=>request('POST',values)};
  }
  async function mount({endpoint,doc,win}){
    doc.title='PPP 4.0 · Semilla · YoDesarrollo';
    doc.body.classList.add('ppp40-mode');
    // Legacy scripts have not run: no example, calculation, draft or write queue is restored.
    for(const node of doc.querySelectorAll('body > main.container,body > .sticky-header,body > .overlay,#gate,#modoLocalBanner'))node.hidden=true;
    const container=doc.createElement('main');container.id='ppp40-root';doc.body.appendChild(container);
    const loading=doc.createElement('p');loading.className='ppp40-loading';loading.textContent='Abriendo tu plan…';container.appendChild(loading);
    const getIdentity=()=>{try{return win.localStorage.getItem(SESSION_KEY)||null;}catch(_){return null;}};
    try{
      const response=await win.fetch(new URL('ppp40-catalog.json',win.location.href),{cache:'no-cache'});
      if(!response.ok)throw new Error('catalog_unavailable');
      const catalog=await response.json();
      if(!catalog||!Array.isArray(catalog.modules)||catalog.modules.length!==18||catalog.modules.reduce((n,m)=>n+(m.questions||[]).length,0)!==96)throw new Error('catalog_invalid');
      let adapter;
      try{adapter=createAdapter({endpoint,getIdentity,fetchImpl:win.fetch.bind(win)});}catch(_){adapter=null;}
      if(adapter)adapter.back=()=>win.location.assign('index.html');
      const ui=win.PPP40UI.mount({container,adapter,catalog,getIdentity,doc,win,graph:win.PPP40Graph});
      const refresh=()=>ui.refreshIdentity();
      win.addEventListener('focus',refresh);
      win.addEventListener('storage',event=>{if(event.key===SESSION_KEY||event.key===null)refresh();});
      // The shared Portero still owns sign-in and validates every request server-side.
      const login=doc.createElement('button');login.type='button';login.className='ppp40-session';login.textContent='Revisar mi acceso';
      login.addEventListener('click',()=>{if(win.YODPortero)win.YODPortero.entrar();});
      doc.body.appendChild(login);
      return ui;
    }catch(_){
      container.replaceChildren();const message=doc.createElement('p');message.className='ppp40-loading';message.textContent='No se pudo abrir el catálogo del plan. Recarga esta página para volver a intentarlo.';container.appendChild(message);
      const back=doc.createElement('a');back.href='index.html';back.textContent='Volver a Potenciales';container.appendChild(back);
      return null;
    }
  }
  return Object.freeze({selected,createAdapter,mount});
});
