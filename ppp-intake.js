/* Captura inicial del PPP. Sólo recoge datos: no calcula ni escribe resultados financieros. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPIntake=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const field=(id,label,unit,min,max,required=false,integer=false)=>Object.freeze({id,label,unit,min,max,required,integer});
  const models=Object.freeze({
    vertical:Object.freeze({label:'Uso mixto / vertical',page:'mixto.html',description:'Vivienda, comercio y sus áreas comunes.',fields:Object.freeze([
      field('inTerreno','Superficie del terreno','m²',500,40000,true),field('inCOS','Ocupación de planta baja · COS','%',1,100),field('inCUS','Intensidad de construcción · CUS','veces',.1,15),field('inM2Depto','Superficie promedio de vivienda','m²',30,250)
    ])}),
    macrolotes:Object.freeze({label:'Macrolotes',page:'macrolotes.html',description:'Suelo, naves y lotes de distintas dimensiones.',fields:Object.freeze([
      field('inFrente','Frente del terreno','m',50,3000,true),field('inFondo','Fondo del terreno','m',50,3000,true),field('inM2Macro','Superficie por macrolote','m²',1000,20000),field('inM2Nave','Superficie por nave','m²',100,1000)
    ])}),
    residencial:Object.freeze({label:'Lotes residenciales',page:'residencial.html',description:'Lotes, urbanización y áreas de uso común.',fields:Object.freeze([
      field('inSuperficie','Superficie del terreno','m²',500,500000,true),field('inFrente','Frente del terreno','m',20,1000),field('inFondo','Fondo del terreno','m',20,1500),field('inM2Lote','Superficie por lote','m²',90,10000)
    ])}),
    unifamiliar:Object.freeze({label:'Unifamiliar',page:'unifamiliar.html',description:'Una vivienda y su programa de espacios.',fields:Object.freeze([
      field('inSuperficie','Superficie del terreno','m²',90,2000,true),field('inFrente','Frente del terreno','m',5,60),field('inFondo','Fondo del terreno','m',10,80),field('inNiveles','Niveles de la vivienda','niveles',1,3,false,true)
    ])}),
    patrimonial:Object.freeze({label:'Patrimonial',page:'patrimonial.html',description:'Unidades en renta y patrimonio a largo plazo.',fields:Object.freeze([
      field('inTerrenoM2','Superficie del terreno','m²',.01,20000,true),field('inCus','Intensidad de construcción · CUS','veces',.1,12),field('inUnidades','Unidades / puertas en renta','unidades',1,60,false,true),field('inPasillosPct','Pasillos y áreas comunes','%',0,45)
    ])})
  });
  const copy=value=>JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  const REQUEST_TIMEOUT_MS=60000;
  // A deadline releases the UI; it does not prove that an Apps Script write was
  // cancelled. Late results are ignored and recovery must use its exact GET receipt.
  function boundedRequest(run,{timeoutMs=REQUEST_TIMEOUT_MS,schedule=setTimeout,cancel=clearTimeout}={}){
    if(!Number.isInteger(timeoutMs)||timeoutMs<1)throw Error('plazo_invalido');
    return new Promise((resolve,reject)=>{
      let settled=false,timer=null;
      const finish=(fn,value)=>{if(settled)return;settled=true;if(timer!==null)cancel(timer);fn(value);};
      timer=schedule(()=>finish(reject,Error('request_timeout')),timeoutMs);
      Promise.resolve().then(run).then(value=>finish(resolve,value),error=>finish(reject,error));
    });
  }
  function createReadGuard(){
    let epoch=0;
    return {capture(){const own=++epoch;return()=>own===epoch;},invalidate(){epoch++;}};
  }
  const normalizeType=type=>{const value=String(type||'').toLowerCase();return value==='mixto'?'vertical':value;};
  function modelFor(type){const model=models[normalizeType(type)];if(!model)throw Error('tipo_invalido');return model;}
  function parseNumber(value){
    if(value===null||value===undefined||typeof value==='string'&&!value.trim())return null;
    if(typeof value!=='number'&&typeof value!=='string')throw Error('cantidad_invalida');
    // No coerción de fórmulas, separadores ambiguos, booleanos, infinito o notación hexadecimal.
    if(typeof value==='string'&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))throw Error('cantidad_invalida');
    const number=Number(value);if(!Number.isFinite(number))throw Error('cantidad_invalida');return number;
  }
  function validate(raw){
    const errors={},type=normalizeType(raw?.model_type),model=models[type];
    if(!model)return {ok:false,errors:{model_type:'Elige un tipo de plan.'}};
    const text=(key,max,required)=>{const value=typeof raw?.[key]==='string'?raw[key].trim():'';if(required&&!value)errors[key]='Completa este dato.';else if(value.length>max)errors[key]='Usa un máximo de '+max+' caracteres.';return value;};
    const nombre_caso=text('nombre_caso',120,true),ubicacion=text('ubicacion',240,true),fuente=text('fuente',600,false);
    const inputs={},pending=[];
    for(const f of model.fields){
      let value;try{value=parseNumber(raw?.inputs?.[f.id]);}catch{errors[f.id]='Escribe una cantidad numérica, sin fórmulas.';continue;}
      if(value===null){if(f.required)errors[f.id]='Necesitamos este dato para abrir el plan.';else pending.push(f.id);continue;}
      if(value<f.min||value>f.max||f.integer&&!Number.isInteger(value)){errors[f.id]=f.integer?'Usa un número entero entre '+f.min+' y '+f.max+'.':'Usa una cantidad entre '+f.min+' y '+f.max+' '+f.unit+'.';continue;}
      inputs[f.id]=value;
    }
    // Desconocidos y datos de un caso existente nunca pasan a una creación nueva.
    if(raw?.caso_id)errors.caso_id='Abre el caso guardado para modificarlo.';
    if(raw?.inputs&&Object.keys(raw.inputs).some(id=>!model.fields.some(f=>f.id===id)))errors.inputs='La ficha incluye datos de otro tipo de plan.';
    const value={schema:'ppp-intake-v1',model_type:type,nombre_caso,ubicacion,fuente,inputs,pending,
      stages:{schema:1,count:1,duration_months:null,mode:'sequential',allocation:'preserve'},
      provenance:{source:fuente||null,status:'por_validar'}};
    return {ok:!Object.keys(errors).length,errors,value};
  }
  function boardPath(type,caseId){
    const page=modelFor(type).page;if(caseId===undefined||caseId===null||caseId==='')return page;
    if(typeof caseId!=='string'||!/^[-A-Za-z0-9_.:]{1,256}$/.test(caseId))throw Error('caso_invalido');
    return page+'?open='+encodeURIComponent(caseId);
  }
  function validateRead(response,{type,id,request_id,inputs}={}){
    if(response?.ok!==true||response.persisted!==true||response.pending!==true||response.calculated!==false||response.model_status!=='MODELO_PENDIENTE'||typeof response.revision!=='string'||!response.revision||!response.caso_id||id&&response.caso_id!==id||request_id&&response.request_id!==request_id)throw Error('sin_confirmacion');
    boardPath(type,response.caso_id);
    const intake=response.intake;if(!intake||intake.schema!=='ppp-intake-v1'||intake.model_type!==normalizeType(type)||typeof intake.nombre_caso!=='string'||!intake.nombre_caso.trim()||typeof intake.ubicacion!=='string'||!intake.ubicacion.trim()||!intake.inputs||typeof intake.inputs!=='object'||Array.isArray(intake.inputs))throw Error('sin_confirmacion');
    for(const [key,value] of Object.entries(intake.inputs))if(!/^in[A-Z]\w*$/.test(key)||value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('sin_confirmacion');
    if(inputs)for(const [key,value] of Object.entries(inputs))if(!own(intake.inputs,key)||intake.inputs[key]!==value)throw Error('sin_confirmacion');
    return copy(response);
  }
  function nativeAdapter({get,post,type,...wait}){
    type=normalizeType(type);modelFor(type);
    const check=(response,expected)=>response?.ok===true?validateRead(response,{type,...expected}):response;
    // Verified PPPIntake.operate serializes the same actor/request/payload under
    // its lock: confirmed operations return their receipt; pending ones reconcile.
    const open=async(draft,beforeSend=()=>true)=>{const {schema,model_type,nombre_caso,ubicacion,fuente,inputs,stages}=draft;return check(await boundedRequest(()=>{if(beforeSend()!==true)throw Error('contexto_cambiado');return post({tipo:'sheet-intake',tipo_desarrollo:type,request_id:draft.request_id,intake:{schema,model_type,nombre_caso,ubicacion,fuente,inputs,stages}});},wait),{request_id:draft.request_id,inputs});};
    return {
      creationReplayContract:'ppp-intake-atomic-request-v1',open,replayCreation:(draft,{beforeSend}={})=>open(draft,typeof beforeSend==='function'?beforeSend:()=>false),
      async update(job){return check(await boundedRequest(()=>post({tipo:'sheet-intake',tipo_desarrollo:type,...job}),wait),{id:job.caso_id,request_id:job.request_id,inputs:job.intake.inputs});},
      async read({id,request_id}){return check(await boundedRequest(()=>get({recurso:'sheet-intake',tipo:type,...(id?{id}:{}),...(request_id?{request_id}:{})}),wait),{id,request_id});},
      async saveStages(payload,{reconcile=false}={}){return boundedRequest(()=>reconcile?get({recurso:'sheet-stages-receipt',tipo:type,caso_id:payload.caso_id,escenario_id:payload.escenario_id,request_id:payload.request_id}):post(payload),wait);}
    };
  }
  const PREWRITE_ERRORS=['invalid_request','invalid_model_type','access_denied','invalid_identity','not_intake_case','revision_required','invalid_stage_plan','invalid_intake_payload','invalid_intake_schema','model_type_mismatch','invalid_nombre_caso','invalid_ubicacion','invalid_fuente','invalid_intake_inputs','unknown_intake_field','invalid_intake_quantity','required_intake_field','use_stage_operation','invalid_initial_stage','empty_intake_update','intake_refresh_failed','revision_conflict','intake_case_operation_pending'];
  const SAFE_ERRORS=new Set([...PREWRITE_ERRORS,'request_timeout','receipt_not_found','lock_busy','ocupado','operation_pending','request_payload_mismatch','recoverable_prewrite','pilot_recovery_conflict','intake_readback_mismatch','native_write_rejected','recibo_no_disponible','creacion_por_confirmar','sin_confirmacion','clave','revocado','expirado','board','admin','tipo','intake_not_installed','creation_replay_unavailable','contexto_cambiado']);
  const safeError=value=>typeof value==='string'&&SAFE_ERRORS.has(value)?value:'sin_confirmacion';
  function diagnosticText(state){
    if(!['error','uncertain'].includes(state?.status)||typeof state.request_id!=='string'||!/^[-A-Za-z0-9_.:]{1,256}$/.test(state.request_id))return '';
    const initial=safeError(state.initial_error||state.error),latest=safeError(state.error);
    return ' Diagnóstico: '+initial+(latest!==initial?' · última consulta: '+latest:'')+' · Solicitud: '+state.request_id;
  }
  function prewriteRejected(response,request,reconcile=false){return !reconcile&&response?.ok===false&&response.persisted===false&&response.request_id===request?.request_id&&typeof request?.request_id==='string'&&PREWRITE_ERRORS.includes(response.error);}
  function createController({adapter,onState=()=>{},requestId=()=>globalThis.crypto.randomUUID(),resumeRequest=null,canReplay=()=>false,...wait}){
    if(!adapter||typeof adapter.open!=='function')throw Error('adaptador_requerido');
    let busy=false,destroyed=false,pending=null,completed=null,attempted=false,initialError=null,replayAllowed=false;
    const replayCapable=()=>{try{return adapter.creationReplayContract==='ppp-intake-atomic-request-v1'&&typeof adapter.replayCreation==='function'&&canReplay()===true;}catch{return false;}};
    function failure(status,error,request_id){const reason=safeError(error);if(!initialError)initialError=reason;onState({status,error:reason,initial_error:initialError,request_id,can_replay:replayAllowed&&replayCapable()});return{ok:false,error:reason};}
    if(resumeRequest){const checked=validate(resumeRequest);if(!checked.ok||typeof resumeRequest.request_id!=='string'||!/^[-A-Za-z0-9_.:]{1,256}$/.test(resumeRequest.request_id))throw Error('solicitud_invalida');pending={fingerprint:JSON.stringify(checked.value),request:{...checked.value,request_id:resumeRequest.request_id}};attempted=true;}
    async function submit(raw,replaying=false){
      if(destroyed)throw Error('ficha_cerrada');
      if(busy)return {ok:false,error:'ocupado'};
      if(completed)return copy(completed);
      const checked=validate(raw);if(!checked.ok){onState({status:'invalid',errors:checked.errors});return checked;}
      const fingerprint=JSON.stringify(checked.value);
      if(pending&&pending.fingerprint!==fingerprint){replayAllowed=false;return failure('uncertain','creacion_por_confirmar',pending.request.request_id);}
      if(replaying&&(!pending||!replayAllowed||!replayCapable())){replayAllowed=false;return failure('uncertain','creation_replay_unavailable',pending?.request.request_id);}
      if(!pending){initialError=null;pending={fingerprint,request:{...checked.value,request_id:requestId()}};}
      replayAllowed=false;busy=true;onState({status:'opening',draft:copy(pending.request),replaying});
      try{
        const checking=attempted&&!replaying;attempted=true;
        if(checking&&typeof adapter.read!=='function')throw Error('recibo_no_disponible');
        const response=await boundedRequest(()=>{
          if(replaying){if(!replayCapable())throw Error('contexto_cambiado');return adapter.replayCreation(copy(pending.request),{beforeSend:replayCapable});}
          return checking?adapter.read({request_id:pending.request.request_id}):adapter.open(copy(pending.request));
        },wait);
        if(destroyed)return {ok:false,error:'ficha_cerrada'};
        if(response?.ok!==true){
          // Sólo un rechazo explícito SIN escritura permite corregir y generar otra solicitud.
          const request_id=pending.request.request_id;
          // A replay refusal describes only that attempt, not the earlier write.
          if(prewriteRejected(response,pending.request,checking||replaying)){pending=null;attempted=false;}
          else if(checking&&response?.ok===false&&response.error==='receipt_not_found'&&response.request_id===request_id&&Object.keys(response).sort().join('|')==='error|ok|request_id'&&replayCapable())replayAllowed=true;
          return failure(pending?'uncertain':'error',response?.error,request_id);
        }
        if(response.request_id!==pending.request.request_id||!['draft','confirmed'].includes(response.status))throw Error('sin_confirmacion');
        if(response.status==='confirmed'&&(response.persisted!==true||!response.caso_id||typeof response.revision!=='string'||!response.revision))throw Error('sin_confirmacion');
        if(response.status==='confirmed'&&response.intake&&(response.intake.model_type!==pending.request.model_type||['nombre_caso','ubicacion','fuente'].some(key=>response.intake[key]!==pending.request[key])||Object.entries(pending.request.inputs).some(([key,value])=>response.intake.inputs?.[key]!==value)))throw Error('sin_confirmacion');
        if(response.status==='draft'&&response.persisted!==false)throw Error('sin_confirmacion');
        const path=boardPath(pending.request.model_type,response.status==='confirmed'?response.caso_id:undefined);
        completed={ok:true,...response,board_path:path,draft:copy(pending.request)};
        onState({status:response.status,result:copy(completed)});return copy(completed);
      }catch(error){if(!destroyed)return failure('uncertain',error?.message,pending?.request.request_id);return {ok:false,error:'sin_confirmacion'};}
      finally{busy=false;}
    }
    return {submit:raw=>submit(raw),replay:raw=>submit(raw,true),get pending(){return pending?copy(pending.request):null;},destroy(){destroyed=true;replayAllowed=false;}};
  }
  function mount({container,type='',value={},adapter,onOpen=()=>{},onCancel=()=>{},onState=()=>{},resumeRequest=null,canReplay=()=>false,existingCaseId=''}){
    if(!container||existingCaseId)return null;
    const doc=container.ownerDocument;let selected=normalizeType(type||value.model_type),destroyed=false;
    if(selected&&!own(models,selected))throw Error('tipo_invalido');
    const drafts={};let common={nombre_caso:value.nombre_caso||'',ubicacion:value.ubicacion||'',fuente:value.fuente||''};
    if(selected)drafts[selected]={...(value.inputs||{})};
    const ui=doc.createElement('section');ui.className='ppp-intake';container.append(ui);
    const controller=createController({adapter,resumeRequest,canReplay,onState:state=>{
      if(destroyed)return;
      const note=ui.querySelector('[data-intake-status]');
      const messages={opening:'Abriendo tu plan…',uncertain:'La apertura está por confirmar. Tus datos se conservan; reintenta con la misma ficha.',error:'No se pudo abrir el plan. Tus datos se conservan.',confirmed:'Plan guardado. Abriendo su tablero…',draft:'Ficha preparada. Todavía no está guardada en Sheets.'};
      note.textContent=messages[state.status]||'';
      if(state.replaying)note.textContent='Reenviando la misma solicitud, con los mismos datos e identificador…';
      const refresh=state.status==='error'&&['revision_conflict','intake_case_operation_pending','intake_refresh_failed'].includes(state.error);
      if(refresh)note.textContent='El libro cambió o tiene otra operación pendiente. Tu ficha se conserva; relee antes de reintentar.';
      if(state.status==='error'&&state.error==='access_denied')note.textContent='Esta sesión no tiene acceso para guardar. Vuelve a abrir el plan con una sesión autorizada.';
      note.textContent+=diagnosticText(state);
      const replay=ui.querySelector('[data-intake-replay]');if(replay)replay.hidden=state.can_replay!==true;
      ui.querySelector('.pi-submit').textContent=state.status==='uncertain'?'Comprobar guardado':refresh?'Releer y reintentar':'Abrir mi plan →';
      ui.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=state.status==='opening'||!!type&&el.name==='model_type');
      if(state.status==='invalid')showErrors(state.errors);
      onState(state);
    }});
    function remember(){for(const key of Object.keys(common)){const el=ui.querySelector('[name="'+key+'"]');if(el)common[key]=el.value;}if(selected){drafts[selected]=drafts[selected]||{};for(const f of models[selected].fields){const el=ui.querySelector('[name="'+f.id+'"]');if(el)drafts[selected][f.id]=el.value;}}}
    function showErrors(errors){ui.querySelectorAll('[data-error]').forEach(el=>{el.textContent=errors[el.dataset.error]||'';});ui.querySelectorAll('[name]').forEach(el=>el.setAttribute('aria-invalid',errors[el.name]?'true':'false'));const key=Object.keys(errors)[0],el=ui.querySelector('[name="'+key+'"]');if(el?.closest('details'))el.closest('details').open=true;el?.focus();}
    const inputMarkup=f=>`<label class="pi-field"><span>${esc(f.label)} <small>${esc(f.unit)}</small>${f.required?' <em>Necesario</em>':''}</span><input name="${f.id}" type="number" inputmode="decimal" min="${f.min}" max="${f.max}" step="${f.integer?'1':'any'}" value="${esc(drafts[selected]?.[f.id]??'')}" placeholder="${f.required?'Captura la cantidad':'Por definir'}" ${f.required?'required':''} aria-describedby="pi-error-${f.id}"><small class="pi-error" id="pi-error-${f.id}" data-error="${f.id}"></small></label>`;
    function render(){
      const model=models[selected];
      ui.innerHTML=`<div class="pi-heading"><div><span class="pi-kicker">NUEVO PLAN DE POTENCIAL</span><h2>Empieza con lo que ya sabes</h2><p>Captura la ficha mínima y continúa en tu tablero. Después podrás ajustar cada área.</p></div><button class="pi-close" type="button" data-intake-cancel aria-label="Cerrar ficha">×</button></div><form novalidate>
        <label class="pi-field"><span>Tipo de plan</span><select name="model_type" required ${type?'disabled':''}><option value="">Selecciona el tipo</option>${Object.entries(models).map(([id,m])=>`<option value="${id}" ${id===selected?'selected':''}>${esc(m.label)}</option>`).join('')}</select><small class="pi-error" data-error="model_type"></small></label>
        <div class="pi-fields"><label class="pi-field"><span>Nombre del plan <em>Necesario</em></span><input name="nombre_caso" maxlength="120" value="${esc(common.nombre_caso)}" placeholder="Nombre para identificar este proyecto" required><small class="pi-error" data-error="nombre_caso"></small></label><label class="pi-field"><span>Ubicación <em>Necesario</em></span><input name="ubicacion" maxlength="240" value="${esc(common.ubicacion)}" placeholder="Ciudad y zona o dirección" required><small class="pi-error" data-error="ubicacion"></small></label></div>
        ${model?`<div class="pi-type-description">${esc(model.description)}</div><div class="pi-fields">${model.fields.filter(f=>f.required).map(inputMarkup).join('')}</div><details class="pi-optional"><summary>Si ya lo sabes, agrega estos datos <span>Opcional</span></summary><div class="pi-fields">${model.fields.filter(f=>!f.required).map(inputMarkup).join('')}</div></details>`:''}
        <label class="pi-field pi-source"><span>Fuente o referencia <small>Opcional</small></span><textarea name="fuente" maxlength="600" rows="2" placeholder="Plano, documento o referencia de los datos">${esc(common.fuente)}</textarea><small class="pi-error" data-error="fuente"></small></label>
        <div class="pi-start"><span class="pi-stage">1</span><div><strong>El plan comienza con una etapa</strong><p>Su duración queda pendiente. Los datos que aún no captures seguirán por definir.</p></div></div>
        <p class="pi-error" data-error="inputs"></p><p class="pi-error" data-error="caso_id"></p><div class="pi-footer"><p data-intake-status role="status" aria-live="polite"></p><button data-intake-replay type="button" hidden>Reintentar misma solicitud</button><button class="pi-submit" type="submit">Abrir mi plan <span aria-hidden="true">→</span></button></div></form>`;
      ui.querySelector('[name="model_type"]').addEventListener('change',event=>{if(type)return;remember();selected=event.target.value;render();});
      ui.querySelector('[data-intake-cancel]').addEventListener('click',()=>onCancel());
      const send=async replay=>{remember();showErrors({});const raw={...common,model_type:selected,inputs:drafts[selected]||{}},result=await(replay?controller.replay(raw):controller.submit(raw));if(result.ok&&!destroyed)onOpen(result);};
      ui.querySelector('form').addEventListener('submit',event=>{event.preventDefault();void send(false);});ui.querySelector('[data-intake-replay]').addEventListener('click',()=>void send(true));
    }
    render();return {element:ui,controller,destroy(){destroyed=true;controller.destroy();ui.remove();},get value(){remember();return {...common,model_type:selected,inputs:{...(drafts[selected]||{})}};}};
  }
  /* Adaptador de captura sobre los tableros existentes. El host debe detener su cálculo
     y su guardado legado mientras blocking sea true; los casos guardados usan deactivate(). */
  function mountBoard({type,controls,adapter=null,onStart=()=>{},onOpen=()=>{},onExit=()=>{},mountStages=true,doc=globalThis.document,win=globalThis.window,storage=win.localStorage,getIdentity=()=>win.localStorage.getItem('pyod_clave_v1')||''}){
    type=normalizeType(type);modelFor(type);
    const main=doc.querySelector('main.container');if(!main)return null;
    let draft=null,form=null,opening=false,active=false,banner=null,key=null,disposed=false,epoch=0,readingNotice=null;const viewGuard=createReadGuard();
    let receipt=null,pending={},job=null,busy=false,saveError='',saveTimer=null,writeEpoch=0;
    let stageEditor=null,stageHost=null,stageOperation=false,stageRefreshing=false,stagePending=false,stageJob=null,recoveredStage=false,stageResumeAllowed=false,leaving=false;
    let identity=getIdentity();
    async function resolveScope(){
      key=null;const ownEpoch=++epoch,owner=identity;
      if(!owner||!win.crypto?.subtle)return;
      try{const digest=await win.crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner));if(!disposed&&ownEpoch===epoch&&owner===getIdentity())key='ppp_intake_draft_v2:'+type+':'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');}catch{}
    }
    let scopeReady=resolveScope();
    const original=new Map(),blockedButtons=new Map();
    const isStageDriver=id=>['macrolotes','residencial'].includes(type)&&['inEtapas','inMesesUrbEtapa'].includes(id);
    const editable=()=>!receipt||receipt.capabilities?.intake?.write===true;
    const stageLocked=()=>stageOperation||stagePending||!!stageJob;
    const host=doc.createElement('div');host.className='ppp-intake-host';main.before(host);
    // Vertical and Patrimonial already have case-specific loading/retry surfaces.
    if(['macrolotes','unifamiliar','residencial'].includes(type)&&new URL(win.location.href).searchParams.get('open')){
      doc.body.classList.add('ppp-intake-reading');readingNotice=doc.createElement('section');readingNotice.className='ppp-intake';readingNotice.setAttribute('role','status');readingNotice.textContent='Leyendo el plan solicitado. Los datos del caso anterior permanecen ocultos. ';
      const reload=doc.createElement('a');reload.href=win.location.href;reload.textContent='Volver a cargar';readingNotice.append(reload);host.append(readingNotice);
    }
    function clearReading(){doc.body.classList.remove('ppp-intake-reading');readingNotice?.remove();readingNotice=null;}
    function readGuard(){const current=viewGuard.capture();return()=>!disposed&&current();}
    const dangerous='#btnWhats,#btnGuardar,#btnPropuesta,#gGuardarSolo,#gGuardarEnviar,#refreshJson,#applyJson,#exportJson,.preset-casa,.gate-mode,.rep-btn,.land-mode,#btnSoloLotes,#escBar button,[data-operation]';
    function persist(){if(!active||!draft||!key||identity!==getIdentity())return;try{
      if(receipt){storage.removeItem(key);storage.setItem(key+':case:'+receipt.caso_id,JSON.stringify({schema:'ppp-intake-pending-v1',model_type:type,caso_id:receipt.caso_id,revision:receipt.revision,job,pending,stage_job:stageJob}));}
      else storage.setItem(key,JSON.stringify(draft));
    }catch{if(banner)banner.querySelector('[data-intake-board-status]').textContent='La captura no se pudo conservar en este navegador. Mantén esta pestaña abierta.';}}
    function updateInput(el){
      if(!active||!draft||!controls.includes(el))return;
      if(stageLocked()||!editable()||isStageDriver(el.id)){el.value=own(draft.inputs,el.id)?draft.inputs[el.id]:'';return;}
      let value;try{value=parseNumber(el.value);}catch{return;}
      if(value===null)delete draft.inputs[el.id];
      else if(value>=Number(el.min)&&value<=Number(el.max))draft.inputs[el.id]=value;else return;
      if(receipt&&adapter?.update){pending[el.id]=value;win.clearTimeout(saveTimer);saveTimer=win.setTimeout(flush,650);}
      persist();paint();
    }
    function paint(){
      if(!active)return;
      for(const control of controls){
        const value=own(draft.inputs,control.id)?draft.inputs[control.id]:null;
        doc.querySelectorAll('[data-input="'+control.id+'"]').forEach(label=>label.textContent=value===null?'Por definir':new Intl.NumberFormat('es-MX',{maximumFractionDigits:6}).format(value));
        control.closest('.input-group')?.classList.toggle('pi-pending-input',value===null);
      }
      doc.querySelectorAll('.kpi-val,.hero-grid .big,.hero-grid .sub2,.micro-readout,.lectura,[id^="hud"],#covenantPanel,.pm-fig-main,.pm-fig-sub,.pm-secsum,.pm-secfig,.pm-sum,.pm-hudline').forEach(el=>el.textContent='Por definir');
      doc.getElementById('escChips')?.replaceChildren();
      main.querySelectorAll('[id^="read"]').forEach(el=>{if(!el.querySelector('input,button,select'))el.textContent='Resultados pendientes de cálculo en Sheets.';});
      main.querySelectorAll('.viz-svg').forEach(el=>el.replaceChildren());
      main.querySelectorAll('.flow-table tbody,.proforma-table tbody,#sourcesUses,#rentaRows,#flowRows').forEach(el=>el.replaceChildren());
      main.querySelectorAll(dangerous).forEach(button=>{if(!blockedButtons.has(button))blockedButtons.set(button,button.disabled);button.disabled=true;});
      const hero=doc.getElementById('heroSub');if(hero)hero.textContent=draft.ubicacion+' · '+(draft.stages?.count||1)+' etapa(s) · captura inicial';
      const name=doc.getElementById('casoNombreBar');if(name)name.textContent=draft.nombre_caso+' · sin guardar en Sheets';
      const dot=doc.getElementById('syncDot');if(dot)dot.textContent='· captura local';
      if(receipt){if(dot)dot.textContent=busy?'· guardando':saveError||job?'· guardado por confirmar':Object.keys(pending).length?'· cambios pendientes':'· captura guardada en Sheets';if(name)name.textContent=draft.nombre_caso+' · ficha en Sheets';}
      if(banner){const stageCount=draft.stages?.count||1;banner.querySelector('.pi-kicker').textContent='FICHA DEL PLAN · '+stageCount+(stageCount===1?' ETAPA':' ETAPAS');const status=banner.querySelector('[data-intake-board-status]');status.textContent=receipt?(busy?'Guardando los datos en Sheets…':saveError==='case_operation_pending'?'Hay otro cambio pendiente en este libro. Este ajuste no se envió a las celdas; conservamos tus cantidades para releer y reintentar después.':['conflicto_revision','revision_rejected'].includes(saveError)?'Otra edición cambió el libro. Tus datos pendientes se conservan. Relee antes de continuar.':saveError==='input_rejected'?'Sheets rechazó este ajuste antes de escribir. Revisa tus cantidades; se conservan para corregir y reintentar.':saveError||job?'El guardado está por confirmar. Conservamos tus datos; comprueba el recibo antes de seguir.':Object.keys(pending).length?'Cambios pendientes de guardar.':'Ficha guardada en Sheets · revisión '+receipt.revision.slice(0,12)+'. El cálculo financiero de esta ficha aún no está conectado.'):((key?'Captura conservada en este navegador para tu sesión.':'Captura sólo en esta pestaña; mantenla abierta.')+' Esta ficha todavía no está guardada en Sheets. El cálculo financiero aún no está conectado.');
        const resume=banner.querySelector('[data-intake-stage-resume]');if(resume){resume.hidden=!recoveredStage||!stageResumeAllowed;resume.disabled=busy||stageOperation;}const retry=banner.querySelector('[data-intake-check]');if(retry){retry.hidden=!job&&!Object.keys(pending).length&&!recoveredStage;retry.disabled=busy||stageOperation||stageLocked()&&!recoveredStage||saveError==='conflicto_revision'&&!job;retry.textContent=recoveredStage?'Comprobar etapas':job?'Comprobar guardado':['case_operation_pending','revision_rejected','input_rejected'].includes(saveError)?'Releer y reintentar':'Guardar cambios pendientes';}}
      syncStageLock();
      stageEditor?.setContext(stageContext());
    }
    function syncStageLock(){
      if(!active)return;const locked=stageLocked();controls.forEach(control=>control.disabled=locked||!editable()||isStageDriver(control.id));
      if(banner){banner.querySelector('[data-intake-edit]').disabled=locked||!editable();if(locked)banner.querySelector('[data-intake-board-status]').textContent=stageRefreshing?'Leyendo el calendario actual de Sheets. Las cantidades se habilitarán al terminar.':'El cambio de etapas está por confirmar. Las cantidades y versiones permanecen bloqueadas hasta comprobar el mismo recibo.';else if(receipt&&!busy&&!saveError&&!job&&!Object.keys(pending).length)banner.querySelector('[data-intake-board-status]').textContent='Ficha guardada en Sheets · revisión '+receipt.revision.slice(0,12)+'. El cálculo financiero de esta ficha aún no está conectado.';}
    }
    function stageState(state){if(leaving||!receipt)return;stagePending=!!state.pending;if(!state.pending&&!state.busy&&!recoveredStage)stageJob=null;syncStageLock();persist();}
    function start(result){
      viewGuard.invalidate();clearReading();
      leaving=false;
      receipt=result.status==='confirmed'?validateRead(result,{type}):null;pending={};job=null;busy=false;saveError='';writeEpoch++;
      active=true;opening=false;draft=copy(result.draft);doc.body.classList.remove('ppp-intake-opening');doc.body.classList.add('ppp-intake-capture');
      if(receipt)draft={...draft,...copy(receipt.intake),inputs:Object.fromEntries(Object.entries(receipt.intake.inputs).filter(([,value])=>value!==null))};
      if(receipt){const url=new URL(win.location.href);url.searchParams.delete('new');url.searchParams.set('open',receipt.caso_id);win.history.replaceState(null,'',url);}
      form?.destroy();form=null;
      for(const control of controls){
        if(!original.has(control))original.set(control,{type:control.type,value:control.value,step:control.step,disabled:control.disabled,title:control.getAttribute('title')});
        control.type='number';control.step='any';control.placeholder='Por definir';control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';
        control.disabled=!editable()||isStageDriver(control.id);
        if(isStageDriver(control.id)){control.title='Se modifica desde Etapas del proyecto.';if(control.id==='inEtapas'&&!control.parentElement.querySelector('.pi-stage-link')){const link=doc.createElement('button');link.type='button';link.className='pi-stage-link';link.textContent='Cambiar etapas';link.onclick=()=>stageHost?.scrollIntoView({behavior:'smooth',block:'center'});control.after(link);}}
        if(control.id==='inEtapas'&&!receipt){control.value=1;draft.inputs.inEtapas=1;}
        control.addEventListener('input',captureInput);control.addEventListener('change',captureInput);
      }
      if(!banner){banner=doc.createElement('section');banner.className='pi-board-banner';main.querySelector('.caso-bar')?.after(banner);if(!banner.isConnected)main.prepend(banner);}
      banner.innerHTML='<div><span class="pi-kicker">FICHA INICIAL · UNA ETAPA</span><h2></h2><p data-intake-board-status></p></div><button type="button" data-intake-check hidden>Comprobar guardado</button><button type="button" data-intake-stage-resume hidden>Reanudar mismo cambio</button><button type="button" data-intake-edit>Editar ficha</button>';
      banner.querySelector('h2').textContent=draft.nombre_caso;banner.querySelector('[data-intake-edit]').onclick=open;banner.querySelector('[data-intake-check]').onclick=checkSave;banner.querySelector('[data-intake-stage-resume]').onclick=()=>recoverStage(true);
      banner.querySelector('[data-intake-edit]').disabled=!editable();
      onStart(copy(draft),receipt?copy(receipt):null);paint();persist();win.dispatchEvent(new win.CustomEvent('ppp:intake-opened',{detail:{model_type:type,persisted:!!receipt}}));
      if(mountStages&&win.PPPStages&&receipt&&adapter?.saveStages&&!stageEditor){stageHost=doc.createElement('section');stageHost.id='pppIntakeStages';banner.after(stageHost);stageEditor=win.PPPStages.mount({container:stageHost,getContext:stageContext,onSave:saveStages,onRefresh:refreshStages,onState:stageState,validModel:model=>{try{validateRead(model,{type,id:receipt?.caso_id});return true;}catch{return false;}},doc,win});}
    }
    function captureInput(event){updateInput(event.target);paint();}
    function closeForm(){form?.destroy();form=null;opening=false;doc.body.classList.remove('ppp-intake-opening');}
    async function open(){
      if(opening||disposed||stageLocked()||active&&!editable())return;checkIdentity();viewGuard.invalidate();clearReading();onOpen();opening=true;const openingIdentity=identity;doc.body.classList.add('ppp-intake-opening');await scopeReady;
      if(disposed||openingIdentity!==getIdentity())return;
      let prior=active?draft:null;
      if(!prior&&key){try{const saved=JSON.parse(storage.getItem(key)||'null');if(saved?.schema==='ppp-intake-v1'&&saved.model_type===type&&saved.inputs&&typeof saved.inputs==='object'&&!Array.isArray(saved.inputs)){
        const knownInputs=Object.fromEntries(models[type].fields.filter(f=>own(saved.inputs,f.id)).map(f=>[f.id,saved.inputs[f.id]]));
        if(validate({...saved,inputs:knownInputs}).ok){prior={...saved,inputs:{}};for(const control of controls){const v=saved.inputs[control.id];if(typeof v==='number'&&Number.isFinite(v)&&v>=Number(control.min)&&v<=Number(control.max))prior.inputs[control.id]=v;}}
      }}catch{}}
      const known=prior?{...prior,inputs:Object.fromEntries(models[type].fields.filter(f=>own(prior.inputs,f.id)).map(f=>[f.id,prior.inputs[f.id]]))}:{};
      let creation=null;if(!receipt&&key){try{const saved=JSON.parse(storage.getItem(key+':creating')||'null');if(saved?.model_type===type&&validate(saved).ok&&typeof saved.request_id==='string'&&/^[-A-Za-z0-9_.:]{1,256}$/.test(saved.request_id)){creation=saved;Object.assign(known,saved);}}catch{}}
      let refreshMetadata=false;const metadataCase=receipt?.caso_id;
      const formAdapter=receipt&&adapter?.update?{open:async value=>{
        if(job||busy||stageLocked()||Object.keys(pending).length)return {ok:false,persisted:false,error:'intake_case_operation_pending',request_id:value.request_id};
        if(refreshMetadata){try{const fresh=await adapter.read({id:metadataCase});if(openingIdentity!==getIdentity()||receipt?.caso_id!==metadataCase)throw Error('contexto_cambiado');receipt=validateRead(fresh,{type,id:metadataCase});refreshMetadata=false;paint();persist();}catch{return{ok:false,persisted:false,error:'intake_refresh_failed',request_id:value.request_id};}}
        const values=Object.fromEntries(models[type].fields.map(field=>[field.id,own(value.inputs,field.id)?value.inputs[field.id]:null]));
        const response=await adapter.update({caso_id:receipt.caso_id,revision_esperada:receipt.revision,request_id:value.request_id,intake:{inputs:values,nombre_caso:value.nombre_caso,ubicacion:value.ubicacion,fuente:value.fuente}});
        if(prewriteRejected(response,value)&&['revision_conflict','intake_case_operation_pending'].includes(response.error))refreshMetadata=true;
        return response;
      },read:({request_id})=>adapter.read({id:metadataCase,request_id})}:adapter||{open:async value=>({ok:true,status:'draft',persisted:false,request_id:value.request_id})};
      form=mount({container:host,type,value:known,adapter:formAdapter,resumeRequest:creation,canReplay:()=>!receipt&&!disposed&&openingIdentity===getIdentity(),onState:state=>{if(receipt||!key||openingIdentity!==getIdentity())return;try{if(state.status==='opening'&&state.draft)storage.setItem(key+':creating',JSON.stringify(state.draft));if(['confirmed','draft','error'].includes(state.status))storage.removeItem(key+':creating');}catch{}},onOpen:result=>{
        if(openingIdentity!==getIdentity()){checkIdentity();return;}
        // Conservar capturas de otras áreas, pero un opcional borrado de la ficha sigue vacío.
        if(prior){const areaInputs=Object.fromEntries(Object.entries(prior.inputs).filter(([id])=>!models[type].fields.some(f=>f.id===id)));result.draft.inputs={...areaInputs,...result.draft.inputs};}start(result);
      },onCancel:()=>{closeForm();if(!active&&new URL(win.location.href).searchParams.get('new')==='1')win.location.href='index.html';else onExit();}});
      host.scrollIntoView({block:'start'});
    }
    function deactivate(){
      viewGuard.invalidate();clearReading();
      writeEpoch++;win.clearTimeout(saveTimer);receipt=null;pending={};job=null;busy=false;saveError='';
      stageEditor?.dispose();stageEditor=null;stageHost?.remove();stageHost=null;stageOperation=false;stageRefreshing=false;stagePending=false;stageJob=null;recoveredStage=false;stageResumeAllowed=false;
      closeForm();active=false;draft=null;doc.body.classList.remove('ppp-intake-capture');banner?.remove();banner=null;
      for(const [control,old] of original){control.removeEventListener('input',captureInput);control.removeEventListener('change',captureInput);control.type=old.type;control.step=old.step;control.value=old.value;control.disabled=old.disabled;control.removeAttribute('placeholder');if(old.title===null)control.removeAttribute('title');else control.setAttribute('title',old.title);control.closest('.input-group')?.classList.remove('pi-pending-input');}original.clear();main.querySelectorAll('.pi-stage-link').forEach(el=>el.remove());
      for(const [button,disabled] of blockedButtons)button.disabled=disabled;blockedButtons.clear();
    }
    function acceptSaved(response,expected){
      const confirmed=validateRead(response,{type,id:receipt.caso_id,request_id:expected.request_id,inputs:expected.intake.inputs});
      receipt=confirmed;job=null;saveError='';
      const values={...confirmed.intake.inputs,...pending};draft={...draft,...copy(confirmed.intake),inputs:Object.fromEntries(Object.entries(values).filter(([,v])=>v!==null))};
      for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';
      paint();persist();
    }
    async function flush(){
      if(!active||!receipt||!adapter?.update||busy||stageLocked()||saveError||job||!Object.keys(pending).length||identity!==getIdentity())return;
      job={caso_id:receipt.caso_id,revision_esperada:receipt.revision,request_id:win.crypto.randomUUID(),intake:{inputs:copy(pending)}};pending={};busy=true;paint();persist();const generation=writeEpoch,owner=identity;
      try{const response=await adapter.update(copy(job));if(generation!==writeEpoch||owner!==getIdentity())return;
        if(prewriteRejected(response,job)){pending={...job.intake.inputs,...pending};job=null;saveError=response.error==='revision_conflict'?'revision_rejected':response.error==='intake_case_operation_pending'?'case_operation_pending':'input_rejected';persist();return;}
        if(response?.ok!==true)throw Error(response?.error||'sin_confirmacion');acceptSaved(response,job);}
      catch(error){if(generation===writeEpoch){saveError=/revision|conflict/.test(error.message)?'conflicto_revision':'sin_confirmacion';}}
      finally{if(generation===writeEpoch){busy=false;paint();if(!saveError&&!job&&Object.keys(pending).length)saveTimer=win.setTimeout(flush,650);}}
    }
    async function checkSave(){
      if(recoveredStage)return recoverStage();
      if(stageLocked())return;
      if(!job&&['case_operation_pending','revision_rejected','input_rejected'].includes(saveError))return refreshBlocked();
      if(!job){return flush();}
      if(!active||!receipt||!adapter?.read||busy||identity!==getIdentity())return;busy=true;paint();const generation=writeEpoch,owner=identity;
      try{const response=await adapter.read({id:receipt.caso_id,request_id:job.request_id});if(generation!==writeEpoch||owner!==getIdentity())return;if(response?.ok!==true)throw Error('sin_confirmacion');acceptSaved(response,job);
        const fresh=await adapter.read({id:receipt.caso_id});if(generation!==writeEpoch||owner!==getIdentity())return;const latest=validateRead(fresh,{type,id:receipt.caso_id});receipt=latest;draft={...draft,...copy(latest.intake),inputs:Object.fromEntries(Object.entries({...latest.intake.inputs,...pending}).filter(([,v])=>v!==null))};for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';persist();}
      catch{if(generation===writeEpoch)saveError='sin_confirmacion';}
      finally{if(generation===writeEpoch){busy=false;paint();if(!saveError&&!job&&Object.keys(pending).length)saveTimer=win.setTimeout(flush,650);}}
    }
    async function refreshBlocked(){
      if(!active||!receipt||busy||stageLocked()||!adapter?.read||identity!==getIdentity())return;
      const generation=writeEpoch,owner=identity,previousError=saveError;busy=true;paint();let refreshed=false;
      try{const fresh=await adapter.read({id:receipt.caso_id});if(generation!==writeEpoch||owner!==getIdentity())return;receipt=validateRead(fresh,{type,id:receipt.caso_id});draft={...draft,...copy(receipt.intake),inputs:Object.fromEntries(Object.entries({...receipt.intake.inputs,...pending}).filter(([,v])=>v!==null))};for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';saveError='';refreshed=true;}
      catch{if(generation===writeEpoch)saveError=previousError;}
      finally{if(generation===writeEpoch){busy=false;paint();persist();if(refreshed)void flush();}}
    }
    function acceptRead(response){
      const confirmed=validateRead(response,{type}),owner=identity,generation=++writeEpoch;
      void scopeReady.then(()=>{
        if(disposed||generation!==writeEpoch||owner!==getIdentity())return;
        let cached=null;try{if(key)cached=JSON.parse(storage.getItem(key+':case:'+confirmed.caso_id)||'null');}catch{}
        deactivate();start({...confirmed,status:'confirmed',draft:confirmed.intake});
        if(cached?.schema!=='ppp-intake-pending-v1'||cached.model_type!==type||cached.caso_id!==confirmed.caso_id)return;
        const validPatch=values=>!!values&&typeof values==='object'&&!Array.isArray(values)&&Object.entries(values).every(([id,v])=>{const c=controls.find(c=>c.id===id);return c&&(v===null||typeof v==='number'&&Number.isFinite(v)&&v>=Number(c.min)&&v<=Number(c.max));});
        if(!validPatch(cached.pending))return;
        if(cached.stage_job&&!cached.job&&!Object.keys(cached.pending).length){const s=cached.stage_job;try{
          if(s.tipo!=='sheet-stages'||normalizeType(s.tipo_desarrollo)!==type||s.caso_id!==confirmed.caso_id||s.escenario_id!==(confirmed.activo||'base')||typeof s.revision_esperada!=='string'||!s.revision_esperada||typeof s.request_id!=='string'||!/^[-A-Za-z0-9_.:]{1,256}$/.test(s.request_id))throw Error('solicitud_invalida');
          stageJob={tipo:'sheet-stages',tipo_desarrollo:s.tipo_desarrollo,caso_id:s.caso_id,escenario_id:s.escenario_id,revision_esperada:s.revision_esperada,request_id:s.request_id,stages:win.PPPStages.validateStages(s.stages)};recoveredStage=true;stagePending=true;paint();persist();return;
        }catch{}}
        if(cached.job){const j=cached.job;if(j.caso_id!==confirmed.caso_id||typeof j.revision_esperada!=='string'||!j.revision_esperada||typeof j.request_id!=='string'||!/^[-A-Za-z0-9_.:]{1,256}$/.test(j.request_id)||!validPatch(j.intake?.inputs))return;job=copy(j);saveError='sin_confirmacion';}
        pending=copy(cached.pending);if(!job&&Object.keys(pending).length&&cached.revision!==confirmed.revision)saveError='conflicto_revision';
        const values={...confirmed.intake.inputs,...(job?.intake.inputs||{}),...pending};draft.inputs=Object.fromEntries(Object.entries(values).filter(([,v])=>v!==null));for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';paint();persist();
      });return true;
    }
    function stageContext(){
      if(!active||!receipt||identity!==getIdentity())return null;
      let cap=receipt.capabilities?.stages;
      // These mirrored drivers publish their business bounds in the canonical read.
      // Keep the server's optional capability limits; older readers supply campos.
      if(cap&&['macrolotes','residencial'].includes(type)&&Array.isArray(receipt.campos)){
        const fields=receipt.campos.filter(f=>f?.id==='inMesesUrbEtapa'),f=fields[0];
        if(fields.length===1&&f.kind==='number'&&Number.isInteger(f.min)&&Number.isInteger(f.max)&&f.min>=1&&f.max>=f.min&&f.max<=cap.max_months)cap={...cap,min_duration_months:cap.min_duration_months??f.min,max_duration_months:cap.max_duration_months??f.max};
      }
      return {verified:true,ready:!busy&&!job&&!saveError&&!recoveredStage&&!Object.keys(pending).length,model_type:type,case_id:receipt.caso_id,scenario_id:receipt.activo||'base',revision:receipt.revision,book_url:receipt.libro_url,stage_binding:receipt.stage_binding,native_capability:cap,native_collection:receipt.stages_by_scenario?.[receipt.activo||'base'],native_checks:receipt.stage_checks_by_scenario?.[receipt.activo||'base'],native_calculated:receipt.stage_calculated_by_scenario?.[receipt.activo||'base'],...(cap?.initial_pending===true&&receipt.intake.stages?.count===1&&receipt.intake.stages.duration_months===null?{native_pending_stages:copy(receipt.intake.stages)}:{})};
    }
    async function saveStages(payload,options){
      if(!active||!receipt||!adapter?.saveStages||stageOperation||busy||job||Object.keys(pending).length||identity!==getIdentity()||stageJob&&((options?.reconcile!==true&&options?.resume!==true)||stageJob.request_id!==payload.request_id||JSON.stringify(stageJob)!==JSON.stringify(payload)))throw Error('pendientes');
      const generation=writeEpoch,owner=identity;stageOperation=true;stageJob=copy(payload);syncStageLock();persist();
      try{const response=await adapter.saveStages(payload,options);if(generation!==writeEpoch||owner!==getIdentity())throw Error('contexto_cambiado');
        if(response?.ok===true){receipt=validateRead(response,{type,id:receipt.caso_id});draft={...draft,...copy(receipt.intake),inputs:Object.fromEntries(Object.entries(receipt.intake.inputs).filter(([,v])=>v!==null))};for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';paint();persist();}return response;
      }finally{if(generation===writeEpoch){stageOperation=false;syncStageLock();}}
    }
    async function refreshStages(){
      if(!active||!receipt||!adapter?.read||stageLocked()||busy||job||Object.keys(pending).length||identity!==getIdentity())throw Error('pendientes');
      const generation=writeEpoch,owner=identity,id=receipt.caso_id;stageOperation=true;stageRefreshing=true;syncStageLock();
      try{const response=await adapter.read({id});if(generation!==writeEpoch||owner!==getIdentity())throw Error('contexto_cambiado');
        receipt=validateRead(response,{type,id});draft={...draft,...copy(receipt.intake),inputs:Object.fromEntries(Object.entries(receipt.intake.inputs).filter(([,v])=>v!==null))};for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';paint();persist();
      }finally{if(generation===writeEpoch){stageOperation=false;stageRefreshing=false;syncStageLock();}}
    }
    async function recoverStage(resume=false){
      if(!recoveredStage||!stageJob||stageOperation||!active||identity!==getIdentity()||resume&&!stageResumeAllowed)return;
      const expected=copy(stageJob),generation=writeEpoch,owner=identity;stageOperation=true;stageResumeAllowed=false;paint();
      try{const response=await adapter.saveStages(expected,{reconcile:!resume,...(resume?{resume:true}:{})});if(generation!==writeEpoch||owner!==getIdentity())return;
        if(response?.ok===false&&response.error==='recoverable_prewrite'&&response.request_id===expected.request_id&&Object.keys(response).sort().join('|')==='error|ok|request_id'){stageResumeAllowed=true;return;}
        if(response?.ok===false&&response.stage_rejection){
          await win.PPPStages.rejection(response,expected);if(generation!==writeEpoch||owner!==getIdentity())return;
          stageJob=null;stagePending=false;recoveredStage=false;stageResumeAllowed=false;stageOperation=false;paint();persist();
          await stageEditor?.restoreRejection(response,expected);return;
        }
        const confirmed=validateRead(response,{type,id:receipt.caso_id});win.PPPStages.receipt(confirmed,expected,()=>true);
        receipt=confirmed;draft={...draft,...copy(confirmed.intake),inputs:Object.fromEntries(Object.entries(confirmed.intake.inputs).filter(([,v])=>v!==null))};for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';stageJob=null;stagePending=false;recoveredStage=false;stageResumeAllowed=false;
      }catch{}finally{if(generation===writeEpoch){stageOperation=false;paint();persist();}}
    }
    function presentationContext(){
      if(!active||!receipt||identity!==getIdentity())return null;
      const scenario=receipt.escenarios?.find(v=>v.id===(receipt.activo||'base'));
      return {board_case_id:receipt.caso_id,viewed_scenario_id:receipt.activo||'base',ppp_revision:receipt.revision,model_type:type,name:draft.nombre_caso,scenario_name:scenario?.nombre||'Base',confirmed:true,pending:!!job||!!saveError||Object.keys(pending).length>0||!!stagePending||!!stageJob||!!recoveredStage,busy:busy||stageLocked()||!!stageOperation};
    }
    function checkIdentity(){
      const next=getIdentity();if(next===identity)return;
      const hadCapture=active||opening;deactivate();identity=next;scopeReady=resolveScope();
      if(hadCapture){opening=true;doc.body.classList.add('ppp-intake-opening');host.replaceChildren();const notice=doc.createElement('p');notice.className='ppp-intake';notice.textContent='La sesión cambió. Vuelve a abrir el plan con tu sesión actual. ';const link=doc.createElement('a');link.href='index.html';link.textContent='Ir a mis planes';notice.append(link);host.append(notice);}
    }
    function preventAction(event){if(active&&event.target.closest?.(dangerous)){event.preventDefault();event.stopImmediatePropagation();}}
    function leavePage(){leaving=true;persist();}
    function resumePage(){if(!leaving)return;leaving=false;if(active&&stageJob){recoveredStage=true;stagePending=true;stageOperation=false;paint();persist();}}
    doc.addEventListener('click',preventAction,true);
    win.addEventListener('storage',checkIdentity);win.addEventListener('focus',checkIdentity);win.addEventListener('pagehide',leavePage);win.addEventListener('pageshow',resumePage);const identityTimer=win.setInterval(checkIdentity,1000);
    return {get active(){return active;},get blocking(){return active||opening;},get draft(){return draft?copy(draft):null;},readGuard,open,paint,persist,flush,checkSave,acceptRead,stageContext,presentationContext,saveStages,deactivate,destroy(){disposed=true;epoch++;deactivate();win.clearInterval(identityTimer);win.removeEventListener('storage',checkIdentity);win.removeEventListener('focus',checkIdentity);win.removeEventListener('pagehide',leavePage);win.removeEventListener('pageshow',resumePage);doc.removeEventListener('click',preventAction,true);host.remove();}};
  }
  return {REQUEST_TIMEOUT_MS,boundedRequest,createReadGuard,PREWRITE_ERRORS,prewriteRejected,safeError,diagnosticText,models,normalizeType,modelFor,parseNumber,validate,boardPath,validateRead,nativeAdapter,createController,mount,mountBoard};
});

