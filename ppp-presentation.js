/* A presentation always starts from the viewed, saved PPP revision.
 * This consumer sends references, never a browser financial snapshot. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPPresentations=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TYPES=['vertical','macrolotes','residencial','unifamiliar','patrimonial'];
 const id=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value);
 const clone=value=>JSON.parse(JSON.stringify(value));
 const stable=value=>JSON.stringify(sort(value));
 function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
 const PHASES={confirmation_pending:'Guardado por confirmar',waiting_capacity:'En espera del agente',queued:'En cola',reading:'Leyendo el plan',formulating:'Armando el guion',drawing:'Dibujando',reviewing:'Revisando',registering:'Guardado por confirmar',ready_for_review:'Versión lista para revisar',awaiting_data:'Datos pendientes',failed:'No se completó',stopped:'Detenido'};
 const ERRORS={service_unavailable:'La generación de presentaciones todavía no está habilitada en el servicio.',unsupported_source:'No se pudo confirmar la lectura de esta versión del plan.',case_unavailable:'Este plan todavía no tiene un expediente habilitado para preparar presentaciones.',pending_changes:'Guarda y confirma los cambios del plan antes de preparar la presentación.',reading_unconfirmed:'Abre una versión guardada y confirma su lectura.',session_changed:'La sesión cambió. Vuelve a abrir el plan con tu sesión actual.',unauthorized:'Tu sesión no tiene acceso a esta presentación.',forbidden:'Tu sesión no tiene acceso a esta presentación.',revision_conflict:'Cambió la revisión del plan. Relee la versión antes de solicitar la presentación.',source_revision_conflict:'Cambió la revisión del plan. Relee la versión antes de solicitar la presentación.',presentation_unavailable:'La generación de presentaciones todavía no está disponible para este plan.',presentation_not_enabled:'La generación de presentaciones todavía no está habilitada.',mapping_required:'Falta confirmar la relación de este plan con su expediente.',case_busy:'El agente tiene otro trabajo pendiente en este expediente. El encargo anterior se conserva.',invalid_response:'No se pudo confirmar la respuesta del servicio.',timeout:'La respuesta tardó demasiado. Consulta el mismo encargo antes de volver a solicitarlo.',unavailable:'No se pudo confirmar el encargo. Consulta su estado antes de solicitar otro.',request_id_reused:'Esta solicitud ya corresponde a otro encargo.',context_changed:'Cambiaste de plan o de versión. El encargo conserva su origen; consulta su estado desde ese plan.'};
 function errorCode(error){const code=error?.code||error?.message;return Object.hasOwn(ERRORS,code)?code:'unavailable';}
 function sourceOf(context){
  if(!context||!id(context.board_case_id)||!id(context.viewed_scenario_id)||typeof context.ppp_revision!=='string'||!context.ppp_revision||context.ppp_revision.length>256||!TYPES.includes(context.model_type))throw Error('reading_unconfirmed');
  return {board_case_id:context.board_case_id,viewed_scenario_id:context.viewed_scenario_id,ppp_revision:context.ppp_revision,model_type:context.model_type};
 }
 function assertReady(context){const source=sourceOf(context);if(context.pending||context.busy)throw Error('pending_changes');if(context.confirmed!==true)throw Error('reading_unconfirmed');return source;}
 function sameSource(a,b){try{return stable(sourceOf(a))===stable(sourceOf(b));}catch{return false;}}
 function normalizeLegacy(scenarios){return scenarios.map(({activo,...v})=>v);}
 function rememberLegacy({caseId,revision,scenarios}){
  if(!id(caseId)||!revision||!Array.isArray(scenarios)||!scenarios.length)return null;
  return {caseId,revision:String(revision),scenarios:clone(normalizeLegacy(scenarios))};
 }
 function legacyContext(saved,{caseId,revision,scenarios,active,inputs,modelType,name,online=true,extras={}}){
  if(!saved||saved.caseId!==caseId||saved.revision!==String(revision))return null;
  const viewed=scenarios.find(v=>v.id===active),canonical=saved.scenarios.find(v=>v.id===active);if(!viewed||!canonical)return null;
  const current=normalizeLegacy(scenarios).map(v=>v.id===active?{...v,inputs:clone(inputs),...extras}:v);
  return {board_case_id:caseId,viewed_scenario_id:active,ppp_revision:saved.revision,model_type:modelType,name:name||'',scenario_name:viewed.nombre||active,confirmed:online,pending:stable(current)!==stable(saved.scenarios),busy:false};
 }
 function nativeContext({model,caseId,active,modelType,name,confirmed,pending=false,busy=false}){
  if(!model||model.caso_id!==caseId||!Array.isArray(model.escenarios))return null;
  const scenario=model.escenarios.find(v=>v.id===active);if(!scenario)return null;
  return {board_case_id:caseId,viewed_scenario_id:active,ppp_revision:model.revision,model_type:modelType,name:name||'',scenario_name:scenario.nombre||active,confirmed:confirmed===true,pending:!!pending,busy:!!busy};
 }
 function presentationURL(presentationId,versionId){
  if(!id(presentationId)||versionId!==undefined&&!id(versionId))return null;
  return 'https://yodesarrollomx.github.io/yodesarrollo-board/presentacion/ppp/?id='+encodeURIComponent(presentationId)+(versionId?'#version='+encodeURIComponent(versionId):'');
 }
 function validateJob(value,source,requestId){
  if(!value||value.ok!==true||!id(value.request_id)||requestId&&value.request_id!==requestId||!id(value.job_id)||!Object.hasOwn(PHASES,value.phase))throw Error('invalid_response');
  const origin=value.source;
  if(!origin||!id(origin.ppp_id)||!id(origin.viewed_scenario_id)||typeof origin.ppp_revision!=='string'||!origin.ppp_revision||origin.ppp_revision.length>256||origin.ppp_id!==source.board_case_id||origin.viewed_scenario_id!==source.viewed_scenario_id||origin.ppp_revision!==source.ppp_revision)throw Error('invalid_response');
  if(value.presentation_id!==undefined&&value.presentation_id!==null&&!id(value.presentation_id)||value.presentation_version_id!==undefined&&value.presentation_version_id!==null&&!id(value.presentation_version_id))throw Error('invalid_response');
  if(value.phase==='ready_for_review'&&(!id(value.presentation_id)||!id(value.presentation_version_id)))throw Error('invalid_response');
  return clone(value);
 }
 function validateList(value,boardCaseId){
  if(!value||value.ok!==true||!Array.isArray(value.jobs)||!Array.isArray(value.presentations)||value.jobs.length>200||value.presentations.length>500)throw Error('invalid_response');
  const jobs=value.jobs.map(job=>validateJob({...job,ok:true},{board_case_id:boardCaseId,viewed_scenario_id:job.source?.viewed_scenario_id,ppp_revision:job.source?.ppp_revision}));
  const presentations=value.presentations.map(p=>{
   if(!p||!id(p.presentation_id)||!id(p.presentation_version_id)||p.source?.ppp_id!==boardCaseId||!id(p.source.viewed_scenario_id)||typeof p.source.ppp_revision!=='string'||!Number.isSafeInteger(p.version_number)||p.version_number<1||typeof p.title!=='string'||p.title.length>200||typeof p.created_at!=='string'||!Number.isFinite(Date.parse(p.created_at)))throw Error('invalid_response');
   return clone(p);
  });return {jobs,presentations};
 }
 function pendingStore({storage,cryptoImpl=globalThis.crypto}){
  async function key(identity,scope){if(!identity||!id(scope))throw Error('session_changed');const bytes=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(identity));return 'ppp-presentation-request-v1:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')+':'+scope;}
  return {async read(identity,scope){const value=JSON.parse(storage.getItem(await key(identity,scope))||'null');if(!value)return null;if(!id(value.request_id)||sourceOf(value.source).board_case_id!==scope)throw Error('invalid_response');return value;},async write(identity,scope,value){const k=await key(identity,scope);if(value)storage.setItem(k,JSON.stringify(value));else storage.removeItem(k);}};
 }
 function controller({read,transport,getIdentity,requestId=()=>globalThis.crypto.randomUUID(),changed=()=>{},storage=null}){
  let identity=getIdentity(),scope='',epoch=0,busy=false,error='',pending=null,retryAllowed=false,jobs=[],presentations=[],disposed=false;
  function context(){const current=read();let key='';try{key=sourceOf(current).board_case_id;}catch{}
   const next=getIdentity();if(next!==identity||key!==scope){identity=next;scope=key;epoch++;pending=null;retryAllowed=false;jobs=[];presentations=[];error='';busy=false;transport.forget?.();}return next?current:null;
  }
  const state=()=>({context:context(),busy,error,pending:pending?clone(pending):null,retryAllowed,jobs:clone(jobs),presentations:clone(presentations)});
  function notify(){if(!disposed)changed(state());}
  function current(owner,generation){context();return !disposed&&identity===owner&&epoch===generation;}
  async function persist(owner,value){if(storage)await storage.write(owner,scope,value);}
  async function run(action){context();if(disposed||busy)return false;const owner=identity,generation=epoch;if(!owner){error='unauthorized';notify();return false;}busy=true;error='';notify();
   try{if(storage&&!pending&&scope){const restored=await storage.read(owner,scope);if(!current(owner,generation))return false;pending=restored;}return await action(owner,generation);}catch(e){if(current(owner,generation)){error=errorCode(e);if(['unauthorized','forbidden','session_changed'].includes(error)){jobs=[];presentations=[];transport.forget?.();}}return false;}finally{if(current(owner,generation)){busy=false;notify();}}
  }
  async function submit(payload,owner,generation){
   retryAllowed=false;const value=await transport.create(payload);
   if(!current(owner,generation))return false;
   if(value?.ok===false){if(value.accepted===false&&value.request_id===payload.request_id){pending=null;retryAllowed=false;await persist(owner,null);}throw Error(value.error||'unavailable');}
   const job=validateJob(value,payload.source,payload.request_id);jobs=[job,...jobs.filter(j=>j.job_id!==job.job_id)];pending=null;retryAllowed=false;await persist(owner,null);return true;
  }
  async function create(options={}){return run(async(owner,generation)=>{
   const source=assertReady(read());if(pending)throw Error('unavailable');
   const payload={request_id:requestId(),source};
   if(options.presentation_id){if(!id(options.presentation_id)||!id(options.base_presentation_version_id))throw Error('invalid_response');payload.presentation_id=options.presentation_id;payload.base_presentation_version_id=options.base_presentation_version_id;}
   pending=clone(payload);await persist(owner,pending);if(!current(owner,generation))return false;notify();
   return submit(payload,owner,generation);
  });}
  async function refresh(){return run(async(owner,generation)=>{
   const source=sourceOf(read()),value=await transport.list({source});
   if(!current(owner,generation))return false;if(value?.ok===false)throw Error(value.error||'unavailable');
   const list=validateList(value,source.board_case_id);jobs=list.jobs;presentations=list.presentations;
   if(pending){const receipt=jobs.find(job=>job.request_id===pending.request_id);if(receipt){validateJob(receipt,pending.source,pending.request_id);pending=null;retryAllowed=false;await persist(owner,null);}}
   return true;
  });}
  async function reconcile(){return run(async(owner,generation)=>{
   if(!pending)return false;const expected=clone(pending),value=await transport.status({request_id:expected.request_id,source:expected.source});
   if(!current(owner,generation))return false;
   if(value?.ok===false){if(value.error==='request_not_found'&&value.accepted===false&&value.request_id===expected.request_id&&value.retry_contract==='presentation-idempotent-v1'&&sameSource(value.source,expected.source)){retryAllowed=true;return true;}throw Error(value.error||'unavailable');}
   const job=validateJob(value,expected.source,expected.request_id);jobs=[job,...jobs.filter(j=>j.job_id!==job.job_id)];pending=null;retryAllowed=false;await persist(owner,null);return true;
  });}
  async function retry(){return run(async(owner,generation)=>{if(!pending||!retryAllowed)throw Error('unavailable');const source=assertReady(read());if(!sameSource(source,pending.source))throw Error('context_changed');return submit(clone(pending),owner,generation);});}
  return {state,create,refresh,reconcile,retry,dispose(){disposed=true;epoch++;jobs=[];presentations=[];pending=null;retryAllowed=false;transport.dispose?.();}};
 }
 function cloudTransport({resolve,getIdentity,fetchImpl=(...args)=>globalThis.fetch(...args),now=()=>Date.now(),timeoutMs=45000}){
  let credential=null,closed=false;const controllers=new Set();
  const forget=()=>{credential=null;};
  async function call(operation,payload){
   if(closed)throw Error('session_changed');const identity=getIdentity();if(!identity)throw Error('unauthorized');const source=sourceOf(payload.source),check=()=>{if(closed||getIdentity()!==identity)throw Error('session_changed');};
   const abort=new AbortController();controllers.add(abort);let timeout,submitted=false;const expired=new Promise((_,reject)=>{timeout=setTimeout(()=>{abort.abort();reject(Error('timeout'));},timeoutMs);});
   try{return await Promise.race([(async()=>{
    if(!credential||credential.identity!==identity||credential.board_case_id!==source.board_case_id||credential.model_type!==source.model_type||credential.expires_at-now()<60000){
     const result=await resolve({board_case_id:source.board_case_id,model_type:source.model_type});check();if(result?.ok===false)throw Error(result.error||'presentation_unavailable');
     if(!result||result.ok!==true||result.board_case_id!==source.board_case_id||!id(result.case_id)||!/^https:\/\/[a-z0-9-]{1,63}\.onrender\.com$/.test(result.endpoint||'')||!/^[A-Za-z0-9_-]{20,1024}\.[a-f0-9]{64}$/.test(result.token||'')||!Number.isSafeInteger(result.expires_at)||result.expires_at<=now())throw Error('invalid_response');
     credential={...result,identity,model_type:source.model_type};
    }
    check();if(abort.signal.aborted)throw Error('timeout');const session=credential;submitted=true;
    const response=await fetchImpl(session.endpoint+'/presentations/'+operation,{method:'POST',credentials:'omit',cache:'no-store',signal:abort.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({...payload,case_id:session.case_id})});
    check();if(abort.signal.aborted)throw Error('timeout');if(response.status===401||response.status===403){forget();throw Error('unauthorized');}
    const raw=await response.text();check();if(raw.length>2097152)throw Error('invalid_response');let value;try{value=JSON.parse(raw);}catch{throw Error('invalid_response');}
    if(!response.ok&&value?.ok!==false)throw Error('unavailable');return value;
   })(),expired]);}catch(error){if(operation==='create'&&!submitted)return {ok:false,accepted:false,request_id:payload.request_id,error:errorCode(error)};throw error;}finally{clearTimeout(timeout);controllers.delete(abort);}
  }
  return {create:p=>call('create',p),status:p=>call('status',p),list:p=>call('list',p),forget,dispose(){closed=true;forget();controllers.forEach(c=>c.abort());controllers.clear();}};
 }
 function mount({read,transport,getIdentity,save,container,doc=document,win=window,storage}){
  const root=container||doc.createElement('section');root.className='ppp-presentations';root.setAttribute('aria-label','Presentaciones de este plan');
  if(!container){const main=doc.querySelector('main.container');if(main)main.before(root);else doc.body.append(root);}
  const make=(tag,text,className)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  const title=make('h2','Presentaciones'),origin=make('p','Abre una versión guardada.'),actions=make('div',undefined,'ppp-presentation-actions'),create=make('button','Mandar hacer presentación con estos números'),refresh=make('button','Consultar presentaciones'),saveButton=make('button','Guardar versión del plan'),reconcile=make('button','Comprobar encargo'),retry=make('button','Reintentar mismo encargo'),status=make('p','', 'ppp-presentation-status'),list=make('div',undefined,'ppp-presentation-list');
  create.type=refresh.type=saveButton.type=reconcile.type=retry.type='button';status.setAttribute('role','status');actions.append(create,saveButton,refresh,reconcile,retry);root.append(title,origin,actions,status,list);
  let last='',lastScope='',lastRefresh=0;
  function paint(s){const c=s.context;let valid=false;try{sourceOf(c);valid=true;}catch{}
   origin.textContent=valid?'Con los números de '+(c.scenario_name||c.viewed_scenario_id)+' · revisión '+c.ppp_revision:'Abre una versión guardada para preparar su presentación.';
   create.disabled=!valid||!c.confirmed||!!c.pending||!!c.busy||s.busy||!!s.pending;
   saveButton.hidden=!valid||!c.pending||typeof save!=='function';saveButton.disabled=s.busy||!!c?.busy;
   refresh.disabled=!valid||s.busy;reconcile.hidden=!s.pending;reconcile.disabled=s.busy;retry.hidden=!s.retryAllowed;retry.disabled=s.busy||!valid||!c.confirmed||!!c.pending||!!c.busy||!sameSource(c,s.pending?.source);
   status.textContent=s.error?ERRORS[s.error]:s.pending?'Encargo por confirmar. Conservamos su solicitud; comprueba el mismo encargo.':s.busy?'Consultando el servicio…':valid&&c.pending?ERRORS.pending_changes:valid&&!c.confirmed?ERRORS.reading_unconfirmed:'';
   const signature=stable([s.jobs,s.presentations,c?.ppp_revision,c?.viewed_scenario_id]);if(signature===last)return;last=signature;list.replaceChildren();
   for(const job of s.jobs){if(s.presentations.some(p=>p.presentation_version_id===job.presentation_version_id))continue;const card=make('article');card.append(make('strong',PHASES[job.phase]),make('p','Origen: '+job.source.viewed_scenario_id+' · revisión '+job.source.ppp_revision));if(job.presentation_version_id){const link=make('a','Abrir y revisar');link.href=presentationURL(job.presentation_id,job.presentation_version_id);card.append(link);}list.append(card);}
   for(const p of s.presentations){const card=make('article');card.append(make('strong',p.title+' · V'+p.version_number),make('p','PPP '+(p.source.scenario_name||p.source.viewed_scenario_id)+' · revisión '+p.source.ppp_revision+' · '+new Date(p.created_at).toLocaleDateString('es-MX')));
    if(valid&&(p.source.ppp_revision!==c.ppp_revision||p.source.viewed_scenario_id!==c.viewed_scenario_id))card.append(make('p','Conserva una versión de origen distinta a la que estás viendo.','ppp-presentation-previous'));
    const link=make('a','Abrir y revisar');link.href=presentationURL(p.presentation_id,p.presentation_version_id);card.append(link);const next=make('button','Crear otra versión');next.type='button';next.disabled=create.disabled;next.onclick=()=>api.create({presentation_id:p.presentation_id,base_presentation_version_id:p.presentation_version_id});card.append(next);list.append(card);
   }
  }
  const api=controller({read,transport,getIdentity,changed:paint,storage:storage===undefined?pendingStore({storage:win.localStorage,cryptoImpl:win.crypto}):storage});create.onclick=()=>api.create();refresh.onclick=()=>api.refresh();reconcile.onclick=()=>api.reconcile();retry.onclick=()=>api.retry();saveButton.onclick=()=>save();
  function tick(){const s=api.state();paint(s);const scope=s.context?.board_case_id||'';
   if(scope!==lastScope){lastScope=scope;lastRefresh=0;}
   if(!doc.hidden&&scope&&!s.busy&&getIdentity()&&(lastRefresh===0||s.jobs.some(j=>['queued','reading','formulating','drawing','reviewing','registering','confirmation_pending','waiting_capacity'].includes(j.phase))&&Date.now()-lastRefresh>10000)){lastRefresh=Date.now();void api.refresh();}
  }
  const timer=win.setInterval(tick,1000);tick();win.addEventListener('focus',tick);win.addEventListener('storage',tick);
  return {...api,destroy(){win.clearInterval(timer);win.removeEventListener('focus',tick);win.removeEventListener('storage',tick);api.dispose();root.remove();}};
 }
 return {TYPES,PHASES,ERRORS,sourceOf,assertReady,sameSource,rememberLegacy,legacyContext,nativeContext,presentationURL,validateJob,validateList,pendingStore,controller,cloudTransport,mount};
});
