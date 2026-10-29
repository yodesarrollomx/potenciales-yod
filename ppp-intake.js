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
  function nativeAdapter({get,post,type}){
    type=normalizeType(type);modelFor(type);
    const check=(response,expected)=>response?.ok===true?validateRead(response,{type,...expected}):response;
    return {
      async open(draft){const {schema,model_type,nombre_caso,ubicacion,fuente,inputs,stages}=draft;return check(await post({tipo:'sheet-intake',tipo_desarrollo:type,request_id:draft.request_id,intake:{schema,model_type,nombre_caso,ubicacion,fuente,inputs,stages}}),{request_id:draft.request_id,inputs});},
      async update(job){return check(await post({tipo:'sheet-intake',tipo_desarrollo:type,...job}),{id:job.caso_id,request_id:job.request_id,inputs:job.intake.inputs});},
      async read({id,request_id}){return check(await get({recurso:'sheet-intake',tipo:type,...(id?{id}:{}),...(request_id?{request_id}:{})}),{id,request_id});},
      async saveStages(payload,{reconcile=false}={}){return reconcile?get({recurso:'sheet-stages-receipt',tipo:type,caso_id:payload.caso_id,escenario_id:payload.escenario_id,request_id:payload.request_id}):post(payload);}
    };
  }
  function createController({adapter,onState=()=>{},requestId=()=>globalThis.crypto.randomUUID(),resumeRequest=null}){
    if(!adapter||typeof adapter.open!=='function')throw Error('adaptador_requerido');
    let busy=false,destroyed=false,pending=null,completed=null,attempted=false;
    if(resumeRequest){const checked=validate(resumeRequest);if(!checked.ok||typeof resumeRequest.request_id!=='string'||!/^[-A-Za-z0-9_.:]{1,256}$/.test(resumeRequest.request_id))throw Error('solicitud_invalida');pending={fingerprint:JSON.stringify(checked.value),request:{...checked.value,request_id:resumeRequest.request_id}};attempted=true;}
    async function submit(raw){
      if(destroyed)throw Error('ficha_cerrada');
      if(busy)return {ok:false,error:'ocupado'};
      if(completed)return copy(completed);
      const checked=validate(raw);if(!checked.ok){onState({status:'invalid',errors:checked.errors});return checked;}
      const fingerprint=JSON.stringify(checked.value);
      if(pending&&pending.fingerprint!==fingerprint){const r={ok:false,error:'creacion_por_confirmar'};onState({status:'uncertain',...r});return r;}
      if(!pending)pending={fingerprint,request:{...checked.value,request_id:requestId()}};
      busy=true;onState({status:'opening',draft:copy(pending.request)});
      try{
        const checking=attempted&&typeof adapter.read==='function';attempted=true;
        const response=checking?await adapter.read({request_id:pending.request.request_id}):await adapter.open(copy(pending.request));
        if(destroyed)return {ok:false,error:'ficha_cerrada'};
        if(response?.ok!==true){
          // Sólo un rechazo explícito SIN escritura permite corregir y generar otra solicitud.
          if(response?.persisted===false){pending=null;attempted=false;}
          onState({status:pending?'uncertain':'error',error:response?.error||'sin_confirmacion'});
          return {ok:false,error:response?.error||'sin_confirmacion'};
        }
        if(response.request_id!==pending.request.request_id||!['draft','confirmed'].includes(response.status))throw Error('sin_confirmacion');
        if(response.status==='confirmed'&&(response.persisted!==true||!response.caso_id||typeof response.revision!=='string'||!response.revision))throw Error('sin_confirmacion');
        if(response.status==='confirmed'&&response.intake&&(response.intake.model_type!==pending.request.model_type||['nombre_caso','ubicacion','fuente'].some(key=>response.intake[key]!==pending.request[key])||Object.entries(pending.request.inputs).some(([key,value])=>response.intake.inputs?.[key]!==value)))throw Error('sin_confirmacion');
        if(response.status==='draft'&&response.persisted!==false)throw Error('sin_confirmacion');
        const path=boardPath(pending.request.model_type,response.status==='confirmed'?response.caso_id:undefined);
        completed={ok:true,...response,board_path:path,draft:copy(pending.request)};
        onState({status:response.status,result:copy(completed)});return copy(completed);
      }catch(error){if(!destroyed)onState({status:'uncertain',error:'sin_confirmacion'});return {ok:false,error:'sin_confirmacion'};}
      finally{busy=false;}
    }
    return {submit,get pending(){return pending?copy(pending.request):null;},destroy(){destroyed=true;}};
  }
  function mount({container,type='',value={},adapter,onOpen=()=>{},onCancel=()=>{},onState=()=>{},resumeRequest=null,existingCaseId=''}){
    if(!container||existingCaseId)return null;
    const doc=container.ownerDocument;let selected=normalizeType(type||value.model_type),destroyed=false;
    if(selected&&!own(models,selected))throw Error('tipo_invalido');
    const drafts={};let common={nombre_caso:value.nombre_caso||'',ubicacion:value.ubicacion||'',fuente:value.fuente||''};
    if(selected)drafts[selected]={...(value.inputs||{})};
    const ui=doc.createElement('section');ui.className='ppp-intake';container.append(ui);
    const controller=createController({adapter,resumeRequest,onState:state=>{
      if(destroyed)return;
      const note=ui.querySelector('[data-intake-status]');
      const messages={opening:'Abriendo tu plan…',uncertain:'La apertura está por confirmar. Tus datos se conservan; reintenta con la misma ficha.',error:'No se pudo abrir el plan. Tus datos se conservan.',confirmed:'Plan guardado. Abriendo su tablero…',draft:'Ficha preparada. Todavía no está guardada en Sheets.'};
      note.textContent=messages[state.status]||'';
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
        <p class="pi-error" data-error="inputs"></p><p class="pi-error" data-error="caso_id"></p><div class="pi-footer"><p data-intake-status role="status" aria-live="polite"></p><button class="pi-submit" type="submit">Abrir mi plan <span aria-hidden="true">→</span></button></div></form>`;
      ui.querySelector('[name="model_type"]').addEventListener('change',event=>{if(type)return;remember();selected=event.target.value;render();});
      ui.querySelector('[data-intake-cancel]').addEventListener('click',()=>onCancel());
      ui.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();remember();showErrors({});const result=await controller.submit({...common,model_type:selected,inputs:drafts[selected]||{}});if(result.ok&&!destroyed)onOpen(result);});
    }
    render();return {element:ui,controller,destroy(){destroyed=true;controller.destroy();ui.remove();},get value(){remember();return {...common,model_type:selected,inputs:{...(drafts[selected]||{})}};}};
  }
  /* Adaptador de captura sobre los tableros existentes. El host debe detener su cálculo
     y su guardado legado mientras blocking sea true; los casos guardados usan deactivate(). */
  function mountBoard({type,controls,adapter=null,onStart=()=>{},onExit=()=>{},mountStages=true,doc=globalThis.document,win=globalThis.window,storage=win.localStorage,getIdentity=()=>win.localStorage.getItem('pyod_clave_v1')||''}){
    type=normalizeType(type);modelFor(type);
    const main=doc.querySelector('main.container');if(!main)return null;
    let draft=null,form=null,opening=false,active=false,banner=null,key=null,disposed=false,epoch=0;
    let receipt=null,pending={},job=null,busy=false,saveError='',saveTimer=null,writeEpoch=0;
    let stageEditor=null,stageHost=null,stageOperation=false;
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
    const host=doc.createElement('div');host.className='ppp-intake-host';main.before(host);
    const dangerous='#btnWhats,#btnGuardar,#btnPropuesta,#gGuardarSolo,#gGuardarEnviar,#refreshJson,#applyJson,#exportJson,.preset-casa,.gate-mode,.rep-btn,.land-mode,#btnSoloLotes,#escBar button,[data-operation]';
    function persist(){if(!active||!draft||!key||identity!==getIdentity())return;try{
      if(receipt){storage.removeItem(key);storage.setItem(key+':case:'+receipt.caso_id,JSON.stringify({schema:'ppp-intake-pending-v1',model_type:type,caso_id:receipt.caso_id,revision:receipt.revision,job,pending}));}
      else storage.setItem(key,JSON.stringify(draft));
    }catch{if(banner)banner.querySelector('[data-intake-board-status]').textContent='La captura no se pudo conservar en este navegador. Mantén esta pestaña abierta.';}}
    function updateInput(el){
      if(!active||!draft||stageOperation||!editable()||isStageDriver(el.id)||!controls.includes(el))return;
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
      main.querySelectorAll('.kpi-val,.hero-grid .big,.hero-grid .sub2,.micro-readout,.lectura,[id^="hud"],#covenantPanel,.pm-fig-main,.pm-fig-sub,.pm-secsum,.pm-secfig,.pm-sum,.pm-hudline').forEach(el=>el.textContent='Por definir');
      main.querySelectorAll('[id^="read"]').forEach(el=>{if(!el.querySelector('input,button,select'))el.textContent='Resultados pendientes de cálculo en Sheets.';});
      main.querySelectorAll('.viz-svg').forEach(el=>el.replaceChildren());
      main.querySelectorAll('.flow-table tbody,.proforma-table tbody,#sourcesUses,#rentaRows,#flowRows').forEach(el=>el.replaceChildren());
      main.querySelectorAll(dangerous).forEach(button=>{if(!blockedButtons.has(button))blockedButtons.set(button,button.disabled);button.disabled=true;});
      const hero=doc.getElementById('heroSub');if(hero)hero.textContent=draft.ubicacion+' · '+(draft.stages?.count||1)+' etapa(s) · captura inicial';
      const name=doc.getElementById('casoNombreBar');if(name)name.textContent=draft.nombre_caso+' · sin guardar en Sheets';
      const dot=doc.getElementById('syncDot');if(dot)dot.textContent='· captura local';
      if(receipt){if(dot)dot.textContent=busy?'· guardando':saveError||job?'· guardado por confirmar':Object.keys(pending).length?'· cambios pendientes':'· captura guardada en Sheets';if(name)name.textContent=draft.nombre_caso+' · ficha en Sheets';}
      if(banner){const stageCount=draft.stages?.count||1;banner.querySelector('.pi-kicker').textContent='FICHA DEL PLAN · '+stageCount+(stageCount===1?' ETAPA':' ETAPAS');const status=banner.querySelector('[data-intake-board-status]');status.textContent=receipt?(busy?'Guardando los datos en Sheets…':saveError==='conflicto_revision'?'Otra edición cambió el libro. Tus datos pendientes se conservan. Relee antes de continuar.':saveError||job?'El guardado está por confirmar. Conservamos tus datos; comprueba el recibo antes de seguir.':Object.keys(pending).length?'Cambios pendientes de guardar.':'Ficha guardada en Sheets · revisión '+receipt.revision.slice(0,12)+'. Los resultados siguen pendientes de completar el modelo nativo.'):(key?'Captura conservada en este navegador para tu sesión.':'Captura sólo en esta pestaña; mantenla abierta.')+' Los resultados y el guardado en Sheets están pendientes de conectar el modelo nativo.';
        const retry=banner.querySelector('[data-intake-check]');if(retry){retry.hidden=!job&&!Object.keys(pending).length;retry.disabled=busy||saveError==='conflicto_revision'&&!job;retry.textContent=job?'Comprobar guardado':'Guardar cambios pendientes';}}
      stageEditor?.setContext(stageContext());
    }
    function start(result){
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
      banner.innerHTML='<div><span class="pi-kicker">FICHA INICIAL · UNA ETAPA</span><h2></h2><p data-intake-board-status></p></div><button type="button" data-intake-check hidden>Comprobar guardado</button><button type="button" data-intake-edit>Editar ficha</button>';
      banner.querySelector('h2').textContent=draft.nombre_caso;banner.querySelector('[data-intake-edit]').onclick=open;banner.querySelector('[data-intake-check]').onclick=checkSave;
      banner.querySelector('[data-intake-edit]').disabled=!editable();
      onStart(copy(draft),receipt?copy(receipt):null);paint();persist();win.dispatchEvent(new win.CustomEvent('ppp:intake-opened',{detail:{model_type:type,persisted:!!receipt}}));
      if(mountStages&&win.PPPStages&&receipt&&adapter?.saveStages&&!stageEditor){stageHost=doc.createElement('section');stageHost.id='pppIntakeStages';banner.after(stageHost);stageEditor=win.PPPStages.mount({container:stageHost,getContext:stageContext,onSave:saveStages,validModel:model=>{try{validateRead(model,{type,id:receipt?.caso_id});return true;}catch{return false;}},doc,win});}
    }
    function captureInput(event){updateInput(event.target);paint();}
    function closeForm(){form?.destroy();form=null;opening=false;doc.body.classList.remove('ppp-intake-opening');}
    async function open(){
      if(opening||disposed||active&&!editable())return;checkIdentity();opening=true;const openingIdentity=identity;doc.body.classList.add('ppp-intake-opening');await scopeReady;
      if(disposed||openingIdentity!==getIdentity())return;
      let prior=active?draft:null;
      if(!prior&&key){try{const saved=JSON.parse(storage.getItem(key)||'null');if(saved?.schema==='ppp-intake-v1'&&saved.model_type===type&&saved.inputs&&typeof saved.inputs==='object'&&!Array.isArray(saved.inputs)){
        const knownInputs=Object.fromEntries(models[type].fields.filter(f=>own(saved.inputs,f.id)).map(f=>[f.id,saved.inputs[f.id]]));
        if(validate({...saved,inputs:knownInputs}).ok){prior={...saved,inputs:{}};for(const control of controls){const v=saved.inputs[control.id];if(typeof v==='number'&&Number.isFinite(v)&&v>=Number(control.min)&&v<=Number(control.max))prior.inputs[control.id]=v;}}
      }}catch{}}
      const known=prior?{...prior,inputs:Object.fromEntries(models[type].fields.filter(f=>own(prior.inputs,f.id)).map(f=>[f.id,prior.inputs[f.id]]))}:{};
      let creation=null;if(!receipt&&key){try{const saved=JSON.parse(storage.getItem(key+':creating')||'null');if(saved?.model_type===type&&validate(saved).ok&&typeof saved.request_id==='string'&&/^[-A-Za-z0-9_.:]{1,256}$/.test(saved.request_id)){creation=saved;Object.assign(known,saved);}}catch{}}
      const formAdapter=receipt&&adapter?.update?{open:async value=>{
        if(job||busy||Object.keys(pending).length)return {ok:false,persisted:false,error:'cambios_pendientes'};
        const values=Object.fromEntries(models[type].fields.map(field=>[field.id,own(value.inputs,field.id)?value.inputs[field.id]:null]));
        return adapter.update({caso_id:receipt.caso_id,revision_esperada:receipt.revision,request_id:value.request_id,intake:{inputs:values,nombre_caso:value.nombre_caso,ubicacion:value.ubicacion,fuente:value.fuente}});
      }}:adapter||{open:async value=>({ok:true,status:'draft',persisted:false,request_id:value.request_id})};
      form=mount({container:host,type,value:known,adapter:formAdapter,resumeRequest:creation,onState:state=>{if(receipt||!key||openingIdentity!==getIdentity())return;try{if(state.status==='opening'&&state.draft)storage.setItem(key+':creating',JSON.stringify(state.draft));if(['confirmed','draft','error'].includes(state.status))storage.removeItem(key+':creating');}catch{}},onOpen:result=>{
        if(openingIdentity!==getIdentity()){checkIdentity();return;}
        // Conservar capturas de otras áreas, pero un opcional borrado de la ficha sigue vacío.
        if(prior){const areaInputs=Object.fromEntries(Object.entries(prior.inputs).filter(([id])=>!models[type].fields.some(f=>f.id===id)));result.draft.inputs={...areaInputs,...result.draft.inputs};}start(result);
      },onCancel:()=>{closeForm();if(!active&&new URL(win.location.href).searchParams.get('new')==='1')win.location.href='index.html';else onExit();}});
      host.scrollIntoView({block:'start'});
    }
    function deactivate(){
      writeEpoch++;win.clearTimeout(saveTimer);receipt=null;pending={};job=null;busy=false;saveError='';
      stageEditor?.dispose();stageEditor=null;stageHost?.remove();stageHost=null;stageOperation=false;
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
      if(!active||!receipt||!adapter?.update||busy||stageOperation||saveError||job||!Object.keys(pending).length||identity!==getIdentity())return;
      job={caso_id:receipt.caso_id,revision_esperada:receipt.revision,request_id:win.crypto.randomUUID(),intake:{inputs:copy(pending)}};pending={};busy=true;paint();persist();const generation=writeEpoch,owner=identity;
      try{const response=await adapter.update(copy(job));if(generation!==writeEpoch||owner!==getIdentity())return;if(response?.ok!==true)throw Error(response?.error||'sin_confirmacion');acceptSaved(response,job);}
      catch(error){if(generation===writeEpoch){saveError=/revision|conflict/.test(error.message)?'conflicto_revision':'sin_confirmacion';}}
      finally{if(generation===writeEpoch){busy=false;paint();if(!saveError&&!job&&Object.keys(pending).length)saveTimer=win.setTimeout(flush,650);}}
    }
    async function checkSave(){
      if(!job){return flush();}
      if(!active||!receipt||!adapter?.read||busy||identity!==getIdentity())return;busy=true;paint();const generation=writeEpoch,owner=identity;
      try{const response=await adapter.read({id:receipt.caso_id,request_id:job.request_id});if(generation!==writeEpoch||owner!==getIdentity())return;if(response?.ok!==true)throw Error('sin_confirmacion');acceptSaved(response,job);
        const fresh=await adapter.read({id:receipt.caso_id});if(generation!==writeEpoch||owner!==getIdentity())return;const latest=validateRead(fresh,{type,id:receipt.caso_id});receipt=latest;draft={...draft,...copy(latest.intake),inputs:Object.fromEntries(Object.entries({...latest.intake.inputs,...pending}).filter(([,v])=>v!==null))};for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';persist();}
      catch{if(generation===writeEpoch)saveError='sin_confirmacion';}
      finally{if(generation===writeEpoch){busy=false;paint();if(!saveError&&!job&&Object.keys(pending).length)saveTimer=win.setTimeout(flush,650);}}
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
        if(cached.job){const j=cached.job;if(j.caso_id!==confirmed.caso_id||typeof j.revision_esperada!=='string'||!j.revision_esperada||typeof j.request_id!=='string'||!/^[-A-Za-z0-9_.:]{1,256}$/.test(j.request_id)||!validPatch(j.intake?.inputs))return;job=copy(j);saveError='sin_confirmacion';}
        pending=copy(cached.pending);if(!job&&Object.keys(pending).length&&cached.revision!==confirmed.revision)saveError='conflicto_revision';
        const values={...confirmed.intake.inputs,...(job?.intake.inputs||{}),...pending};draft.inputs=Object.fromEntries(Object.entries(values).filter(([,v])=>v!==null));for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';paint();persist();
      });return true;
    }
    function stageContext(){
      if(!active||!receipt||identity!==getIdentity())return null;
      const cap=receipt.capabilities?.stages;
      return {verified:true,ready:!busy&&!job&&!saveError&&!Object.keys(pending).length,model_type:type,case_id:receipt.caso_id,scenario_id:receipt.activo||'base',revision:receipt.revision,native_capability:cap,native_collection:receipt.stages_by_scenario?.[receipt.activo||'base'],native_checks:receipt.stage_checks_by_scenario?.[receipt.activo||'base'],native_calculated:receipt.stage_calculated_by_scenario?.[receipt.activo||'base'],...(cap?.initial_pending===true&&receipt.intake.stages?.count===1&&receipt.intake.stages.duration_months===null?{native_pending_stages:copy(receipt.intake.stages)}:{})};
    }
    async function saveStages(payload,options){
      if(!active||!receipt||!adapter?.saveStages||stageOperation||busy||job||Object.keys(pending).length||identity!==getIdentity())throw Error('pendientes');
      const generation=writeEpoch,owner=identity;stageOperation=true;controls.forEach(control=>control.disabled=true);
      try{const response=await adapter.saveStages(payload,options);if(generation!==writeEpoch||owner!==getIdentity())throw Error('contexto_cambiado');
        if(response?.ok===true){receipt=validateRead(response,{type,id:receipt.caso_id});draft={...draft,...copy(receipt.intake),inputs:Object.fromEntries(Object.entries(receipt.intake.inputs).filter(([,v])=>v!==null))};for(const control of controls)control.value=own(draft.inputs,control.id)?draft.inputs[control.id]:'';paint();persist();}return response;
      }finally{if(generation===writeEpoch){stageOperation=false;controls.forEach(control=>control.disabled=!editable()||isStageDriver(control.id));}}
    }
    function checkIdentity(){
      const next=getIdentity();if(next===identity)return;
      const hadCapture=active||opening;deactivate();identity=next;scopeReady=resolveScope();
      if(hadCapture){opening=true;doc.body.classList.add('ppp-intake-opening');host.replaceChildren();const notice=doc.createElement('p');notice.className='ppp-intake';notice.textContent='La sesión cambió. Vuelve a abrir el plan con tu sesión actual. ';const link=doc.createElement('a');link.href='index.html';link.textContent='Ir a mis planes';notice.append(link);host.append(notice);}
    }
    function preventAction(event){if(active&&event.target.closest?.(dangerous)){event.preventDefault();event.stopImmediatePropagation();}}
    doc.addEventListener('click',preventAction,true);
    win.addEventListener('storage',checkIdentity);win.addEventListener('focus',checkIdentity);const identityTimer=win.setInterval(checkIdentity,1000);
    return {get active(){return active;},get blocking(){return active||opening;},get draft(){return draft?copy(draft):null;},open,paint,persist,flush,checkSave,acceptRead,stageContext,saveStages,deactivate,destroy(){disposed=true;epoch++;deactivate();win.clearInterval(identityTimer);win.removeEventListener('storage',checkIdentity);win.removeEventListener('focus',checkIdentity);doc.removeEventListener('click',preventAction,true);host.remove();}};
  }
  return {models,normalizeType,modelFor,parseNumber,validate,boardPath,validateRead,nativeAdapter,createController,mount,mountBoard};
});
