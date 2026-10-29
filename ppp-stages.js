/* PPP stages: commands, capture and verified readback. Sheets owns every result. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PPPStages=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_STAGES=24,MAX_MONTHS=1200;
 const TYPES=['vertical','macrolotes','unifamiliar','residencial','patrimonial'];
 const CHECKS=['inventory','areas','sales','costs','cash','debt','distribution','horizon','formulas'];
 const REJECTIONS=['revision_conflict','stage_binding_missing','stage_read_only','native_stage_horizon_conflict','native_stage_formula_changed','native_stage_formula_missing','native_stage_protection_missing','native_stage_distribution_unsupported','protected_native_stage_driver','invalid_native_stage_calendar','native_stage_template_mismatch'];
 const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':object(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
 const CHECK_LABELS={inventory:'Inventario',areas:'Áreas',sales:'Ingresos',costs:'Costos',cash:'Caja',debt:'Deuda',distribution:'Distribuciones',horizon:'Calendario',formulas:'Fórmulas'};
 const clone=v=>JSON.parse(JSON.stringify(v));
 const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(v);
 const rev=v=>typeof v==='string'&&!!v&&v.length<=256;
 const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
 const single=(v,word)=>Array.isArray(v)&&v.length===1&&v[0]===word;
  const PREWRITE_ERRORS=['invalid_request','invalid_model_type','access_denied','invalid_identity','not_intake_case','revision_required','invalid_stage_plan','invalid_intake_payload','invalid_intake_schema','model_type_mismatch','invalid_nombre_caso','invalid_ubicacion','invalid_fuente','invalid_intake_inputs','unknown_intake_field','invalid_intake_quantity','required_intake_field','use_stage_operation','invalid_initial_stage','empty_intake_update','intake_refresh_failed','revision_conflict','intake_case_operation_pending'];
  function prewriteRejected(response,request,reconcile=false){return !reconcile&&response?.ok===false&&response.persisted===false&&response.request_id===request?.request_id&&typeof request?.request_id==='string'&&PREWRITE_ERRORS.includes(response.error);}
 function capability(v){
  if(!object(v)||v.schema!==1||v.read!==true||typeof v.write!=='boolean'||!Number.isInteger(v.max_stages)||v.max_stages<1||v.max_stages>MAX_STAGES||!Number.isInteger(v.max_months)||v.max_months<1||v.max_months>MAX_MONTHS||!single(v.modes,'sequential')||!single(v.allocation_modes,'preserve')||typeof v.assumption!=='string'||!v.assumption.trim()||v.assumption.length>300)return null;
  const min=v.min_duration_months===undefined?1:v.min_duration_months,max=v.max_duration_months===undefined?v.max_months:v.max_duration_months;
  if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>v.max_months)return null;
  return{schema:1,read:true,write:v.write,max_stages:v.max_stages,max_months:v.max_months,min_duration_months:min,max_duration_months:max,modes:['sequential'],allocation_modes:['preserve'],assumption:v.assumption};
 }
 function validateStages(v,max=MAX_STAGES,months=MAX_MONTHS,minDuration=1,maxDuration=months){
  if(!exact(v,['schema','count','duration_months','mode','allocation'])||v.schema!==1||!Number.isInteger(v.count)||v.count<1||v.count>max||!Number.isInteger(v.duration_months)||v.duration_months<minDuration||v.duration_months>maxDuration||v.count*v.duration_months>months||v.mode!=='sequential'||v.allocation!=='preserve')throw Error('invalid_stages');
  return{schema:1,count:v.count,duration_months:v.duration_months,mode:'sequential',allocation:'preserve'};
 }
 function validateCollection(v,max=MAX_STAGES,months=MAX_MONTHS){
  if(!exact(v,['schema','count','duration_months','mode','allocation','stages']))throw Error('invalid_stage_collection');
  const core=validateStages(Object.fromEntries(['schema','count','duration_months','mode','allocation'].map(k=>[k,v[k]])),max,months);
  if(!Array.isArray(v.stages)||v.stages.length!==v.count)throw Error('invalid_stage_collection');
  const seen=new Set();let previous=null;
  const stages=v.stages.map((row,i)=>{if(!exact(row,['id','order','start_month','duration_months','end_month'])||!id(row.id)||seen.has(row.id)||row.order!==i+1||!Number.isInteger(row.start_month)||row.start_month<1||row.duration_months!==core.duration_months||!Number.isInteger(row.end_month)||row.end_month!==row.start_month+row.duration_months-1||row.end_month>months||previous!==null&&row.start_month!==previous+1)throw Error('invalid_stage_row');seen.add(row.id);previous=row.end_month;return clone(row);});
  return{...core,stages};
 }
 function sameStages(a,b){try{return JSON.stringify(validateStages(a))===JSON.stringify(validateStages(b));}catch{return false;}}
 function drivers(collection){return Object.fromEntries(['schema','count','duration_months','mode','allocation'].map(k=>[k,collection[k]]));}
 function validContext(c){return c?.verified===true&&c.ready===true&&TYPES.includes(c.model_type)&&id(c.case_id)&&id(c.scenario_id)&&rev(c.revision);}
 function initialPending(c){const v=c?.native_pending_stages;return validContext(c)&&capability(c.native_capability)?.read===true&&c.native_capability.initial_pending===true&&c.native_collection==null&&exact(v,['schema','count','duration_months','mode','allocation'])&&v.schema===1&&v.count===1&&v.duration_months===null&&v.mode==='sequential'&&v.allocation==='preserve';}
 function nativeChecks(c){if(!validContext(c)||!capability(c.native_capability)?.read||!exact(c.native_checks,CHECKS)||CHECKS.some(k=>typeof c.native_checks[k]!=='boolean')||typeof c.native_calculated!=='boolean'||c.native_calculated!==CHECKS.every(k=>c.native_checks[k]))return null;return clone(c.native_checks);}
 function identity(c){return validContext(c)?[c.model_type,c.case_id,c.scenario_id].join('|'):null;}
 function request(c,stages,requestId){const cap=capability(c?.native_capability);if(!validContext(c)||!cap?.write||!id(requestId))throw Error('native_stages_unavailable');return{tipo:'sheet-stages',tipo_desarrollo:c.model_type.toUpperCase(),caso_id:c.case_id,escenario_id:c.scenario_id,revision_esperada:c.revision,request_id:requestId,stages:validateStages(stages,cap.max_stages,cap.max_months,cap.min_duration_months,cap.max_duration_months)};}
 function receipt(model,payload,validModel){
  const base=typeof validModel==='function'?validModel(model,payload.caso_id):model?.ok===true&&model.caso_id===payload.caso_id&&rev(model.revision)&&Array.isArray(model.escenarios)&&model.escenarios.some(e=>e.id===payload.escenario_id);
  const cap=capability(model?.capabilities?.stages),r=model?.stage_receipt;
  if(!base||!cap||!object(r)||r.request_id!==payload.request_id||r.caso_id!==payload.caso_id||r.escenario_id!==payload.escenario_id||r.base_revision!==payload.revision_esperada||!rev(r.result_revision)||typeof r.calculated!=='boolean'||!exact(r.checks,CHECKS)||CHECKS.some(k=>typeof r.checks[k]!=='boolean')||r.calculated!==CHECKS.every(k=>r.checks[k]))throw Error('unconfirmed_stage_receipt');
  const original=validateCollection(r.stages,cap.max_stages,cap.max_months),current=validateCollection(model.stages_by_scenario?.[payload.escenario_id],cap.max_stages,cap.max_months);
  if(!sameStages(drivers(original),payload.stages))throw Error('stage_readback_mismatch');
  const superseded=r.result_revision!==model.revision;
  if(superseded?model.stage_receipt_status!=='superseded':model.stage_receipt_status!==undefined||JSON.stringify(original)!==JSON.stringify(current))throw Error('stage_readback_mismatch');
  return{ok:true,request_id:payload.request_id,case_id:payload.caso_id,scenario_id:payload.escenario_id,base_revision:payload.revision_esperada,revision:r.result_revision,native_collection:original,calculated:r.calculated,checks:clone(r.checks),...(superseded?{status:'confirmed_superseded',current_revision:model.revision,current_collection:current}:{})};
 }
 const small=['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciseis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidos','veintitres','veinticuatro','veinticinco','veintiseis','veintisiete','veintiocho','veintinueve'];
 const tens={treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90};
 const hundreds={cien:100,ciento:100,doscientos:200,trescientos:300,cuatrocientos:400,quinientos:500,seiscientos:600,setecientos:700,ochocientos:800,novecientos:900};
 function integer(word){
  if(/^[1-9]\d*$/.test(word))return Number(word);
  if(['un','una'].includes(word))return 1;
  const n=small.indexOf(word);if(n>=0)return n;
  if(tens[word])return tens[word];if(hundreds[word])return hundreds[word];
  const t=word.match(/^(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa) y (uno|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)$/);if(t)return tens[t[1]]+integer(t[2]);
  const h=word.match(/^(ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos) (.+)$/);if(h){const r=integer(h[2]);return r>0&&r<100?hundreds[h[1]]+r:NaN;}
  if(word==='mil')return 1000;const m=word.match(/^mil (.+)$/);if(m){const r=integer(m[1]);return r>0&&r<=200?1000+r:NaN;}return NaN;
 }
 function parseCommand(text,limits={max_stages:MAX_STAGES,max_months:MAX_MONTHS}){
  if(typeof text!=='string'||text.length>300)throw Error('invalid_stage_command');
  let normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[.!?]+$/,'').trim().replace(/\s+/g,' ');
  normalized=normalized.replace(/^(?:(?:mira|por favor),? )?(?:van a ser|seran|vamos a tener|quiero que sean|quiero|cambia a|cambialo a|organiza en|organizalo en|establece|serian|haz) /,'').replace(/,? por favor$/,'');
  // Full-string grammar intentionally rejects negatives, conflicting totals, decimals and ranges.
  const match=normalized.match(/^(.+?) etapas?(?: (consecutivas?|secuenciales?|en sucesion|en paralelo|paralelas?))? (?:de|con) (.+?) mes(?:es)?(?: (?:cada una|cada etapa|por etapa))?(?: (consecutivas?|secuenciales?|en sucesion|una (?:despues|tras) (?:de )?otra|en paralelo|paralelas?))?$/);
  if(!match||match[2]&&match[4])throw Error('invalid_stage_command');
  const count=integer(match[1]),duration=integer(match[3]);
  validateStages({schema:1,count,duration_months:duration,mode:'sequential',allocation:'preserve'},limits.max_stages,limits.max_months,limits.min_duration_months,limits.max_duration_months);
  const order=match[2]||match[4],mode=!order?null:/paralel/.test(order)?'parallel':'sequential';
  return {schema:1,count,duration_months:duration,mode,allocation:'preserve'};
 }
 function describeProposal(v,assumption='Se conservan las distribuciones existentes.'){
  if(!object(v)||!['sequential','parallel',null].includes(v.mode))throw Error('invalid_stage_command');
  const s=validateStages({...v,mode:'sequential'});if(typeof assumption!=='string'||!assumption.trim()||assumption.length>300)throw Error('invalid_stage_assumption');
  return `Entendí: ${s.count} ${s.count===1?'etapa':'etapas'} de ${s.duration_months} ${s.duration_months===1?'mes':'meses'} cada una. `+(v.mode==='sequential'?`Consecutivas: ${s.count*s.duration_months} ${s.count*s.duration_months===1?'mes':'meses'} para las etapas. `:v.mode==='parallel'?'En paralelo. ':'Falta definir si serán consecutivas o en paralelo. ')+assumption;
 }
 async function rejection(response,payload,hash=sha256){
  const proof=response?.stage_rejection,atomic=proof?.stage==='atomic_write',keys=['request_id','caso_id','escenario_id','base_revision','actor','payload_hash','stage','write_attempted','error','rejected_at'].concat(atomic?['committed']:[]);
  if(response?.ok!==false||response.error!=='operation_rejected'||response.request_id!==payload.request_id||response.stage_operation_status!=='rejected'||!exact(proof,keys)||proof.request_id!==payload.request_id||proof.caso_id!==payload.caso_id||proof.escenario_id!==payload.escenario_id||proof.base_revision!==payload.revision_esperada||typeof proof.actor!=='string'||!proof.actor||proof.actor.length>256||(atomic?(proof.write_attempted!==true||proof.committed!==false||proof.error!=='native_stage_write_rejected'):(proof.stage!=='prewrite'||proof.write_attempted!==false||!REJECTIONS.includes(proof.error)))||typeof proof.payload_hash!=='string'||!/^[a-f0-9]{64}$/.test(proof.payload_hash)||typeof proof.rejected_at!=='string'||!Number.isFinite(Date.parse(proof.rejected_at))||Date.parse(proof.rejected_at)>Date.now()+5000||typeof hash!=='function')throw Error('unconfirmed_stage_rejection');
  if(await hash(stable({actor:proof.actor,caso_id:payload.caso_id,escenario_id:payload.escenario_id,base_revision:payload.revision_esperada,stages:validateStages(payload.stages)}))!==proof.payload_hash)throw Error('unconfirmed_stage_rejection');
  return{status:'rejected',error:proof.error};
 }
 async function sha256(text){const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
 function createController({getContext,onSave,onState=()=>{},validModel,hash=sha256,uuid=()=>globalThis.crypto.randomUUID()}){
  let context=null,command='',proposal=null,pending=null,resumeAllowed=false,phase='idle',error='',lastReceipt=null,epoch=0,operation=null,disposed=false,conflictRevision=null;
  function status(){return{phase,command,generation:epoch,proposal:proposal?clone(proposal):null,pending:!!pending,resume_allowed:resumeAllowed,pending_request_id:pending?.request_id||null,busy:!!operation,error,receipt:lastReceipt?clone(lastReceipt):null,context:context?clone(context):null};}
  const notify=()=>onState(status());
  function clear(){epoch++;context=null;command='';proposal=null;pending=null;resumeAllowed=false;phase='idle';error='';lastReceipt=null;conflictRevision=null;notify();}
  function setContext(next){
   const authoritative=getContext();if(!validContext(next)||!validContext(authoritative)||identity(next)!==identity(authoritative)||next.revision!==authoritative.revision){clear();return false;}
   if(context&&identity(context)!==identity(next))clear();else if(context&&!pending&&!operation&&(context.revision!==next.revision||stable(context.native_capability)!==stable(next.native_capability)||stable(context.native_collection)!==stable(next.native_collection))) {proposal=null;lastReceipt=null;error='';phase='idle';}context=clone(next);if(!pending&&!operation&&['idle','ready','unavailable'].includes(phase))phase=capability(next.native_capability)?.write?'ready':'unavailable';notify();return true;
  }
  function setCommand(value){if(pending||operation||disposed)return false;command=String(value);proposal=null;error='';lastReceipt=null;if(phase!=='conflict')phase='ready';notify();return true;}
  function rejectedState(result,payload){pending=null;phase=result.error==='revision_conflict'?'conflict':'rejected';conflictRevision=payload.revision_esperada;error=result.error==='revision_conflict'?'El libro cambió. Actualiza desde Sheets y revisa la instrucción; no se sobrescribió la otra edición.':'El libro confirmó que el cambio no se aplicó. Actualiza desde Sheets y revisa el calendario; tu instrucción se conserva.';}
  async function restoreRejection(response,payload){
   if(disposed||operation||pending)return false;const fresh=getContext(),own=epoch;
   if(!validContext(fresh)||!context||identity(fresh)!==identity(context)||payload?.tipo!=='sheet-stages'||payload.tipo_desarrollo!==fresh.model_type.toUpperCase()||payload.caso_id!==fresh.case_id||payload.escenario_id!==fresh.scenario_id)return false;
   try{const result=await rejection(response,payload,hash);if(disposed||own!==epoch||operation||pending||identity(getContext())!==identity(fresh))return false;const s=validateStages(payload.stages);command=`${s.count} etapas de ${s.duration_months} meses`;lastReceipt=null;rejectedState(result,payload);notify();return true;}catch{return false;}
  }
  function binding(c){return stable({model_type:c.model_type,case_id:c.case_id,scenario_id:c.scenario_id,revision:c.revision,book_url:c.book_url||null,stage_binding:c.stage_binding||null,capability:c.native_capability,collection:c.native_collection,pending_stages:c.native_pending_stages});}
  function prepare(){
   if(disposed||operation||pending)return false;const fresh=getContext();
   if(!validContext(fresh)||!context||identity(fresh)!==identity(context)||binding(fresh)!==binding(context)||!capability(fresh.native_capability)?.write){proposal=null;phase='unavailable';error='El contexto cambió. Relee el calendario antes de revisar.';notify();return false;}
   try{if(conflictRevision===fresh.revision)throw Error('revision_conflict');const parsed=parseCommand(command,capability(fresh.native_capability));proposal={command,binding:binding(fresh),stages:parsed};phase=parsed.mode==='parallel'?'unsupported':parsed.mode?'preview':'clarify';error=parsed.mode==='parallel'?'Las etapas en paralelo aún no están disponibles; no se ha guardado el cambio.':'';notify();return true;}
   catch(e){proposal=null;phase=e.message==='revision_conflict'?'conflict':'invalid';error=e.message==='revision_conflict'?'Actualiza desde Sheets y revisa el cambio antes de enviarlo.':'No pude interpretar la instrucción. Indica una cantidad y duración enteras, por ejemplo: 3 etapas de 12 meses.';notify();return false;}
  }
  function chooseMode(mode){
   if(disposed||operation||pending||!proposal||!['sequential','parallel'].includes(mode))return false;
   const fresh=getContext();if(!validContext(fresh)||binding(fresh)!==proposal.binding||proposal.command!==command){proposal=null;phase='ready';error='El contexto cambió. Revisa de nuevo la instrucción.';notify();return false;}
   proposal.stages.mode=mode;phase=mode==='parallel'?'unsupported':'preview';error=mode==='parallel'?'Las etapas en paralelo aún no están disponibles; no se ha guardado el cambio.':'';notify();return true;
  }
  async function save({resume=false}={}){
   if(disposed||operation)return false;const fresh=getContext();if(!validContext(fresh)||!context||identity(fresh)!==identity(context)){clear();return false;}
   if(resume&&(!pending||!resumeAllowed))return false;
   const reconcile=!!pending&&!resume;
   if(!pending){if(!proposal||phase!=='preview'||proposal.stages.mode!=='sequential'||proposal.command!==command||proposal.binding!==binding(fresh)){proposal=null;phase='ready';error='Revisa el cambio y elige el orden antes de guardar.';notify();return false;}try{pending=request(fresh,proposal.stages,'stages-'+uuid());proposal=null;}catch{proposal=null;phase='invalid';error='El calendario ya no admite esta propuesta. Revisa de nuevo.';notify();return false;}}
   const payload=clone(pending),own=epoch;resumeAllowed=false;phase=reconcile?'checking':'saving';error='';let resolveOperation;operation=new Promise(resolve=>{resolveOperation=resolve;});notify();
   try{
    const model=await onSave(payload,{reconcile,...(resume?{resume:true}:{})});if(disposed||own!==epoch||!pending||pending.request_id!==payload.request_id)return false;
    const latest=getContext();if(!validContext(latest)||identity(latest)!==identity(context)){clear();return false;}
    if(model?.ok===false&&model.error==='recoverable_prewrite'&&model.request_id===payload.request_id&&Object.keys(model).sort().join('|')==='error|ok|request_id'){resumeAllowed=true;phase='resumable';error='Sheets conserva la solicitud pendiente y confirmó que su calendario base sigue intacto. Puedes reanudar el mismo cambio.';return false;}
    if(prewriteRejected(model,payload,reconcile||resume)){
     if(model.error==='revision_conflict'){rejectedState(model,payload);return false;}
     pending=null;phase=model.error==='intake_case_operation_pending'?'blocked':'invalid';error=model.error==='intake_case_operation_pending'?'Hay otro cambio pendiente en este libro. Esta instrucción no se aplicó; comprueba el cambio anterior y vuelve a intentarlo.':model.error==='invalid_stage_plan'?'La duración o cantidad de etapas está fuera del rango permitido por este libro. No se aplicó el cambio; revisa la instrucción.':'Sheets rechazó esta instrucción antes de escribir. Se conserva para revisarla y volver a intentarlo.';return false;
    }
    if(model?.ok===false&&model.stage_rejection){const rejected=await rejection(model,payload,hash);if(disposed||own!==epoch)return false;rejectedState(rejected,payload);return false;}
    const ack=receipt(model,payload,validModel);if(latest.revision!==model.revision||JSON.stringify(validateCollection(latest.native_collection))!==JSON.stringify(validateCollection(model.stages_by_scenario[payload.escenario_id])))throw Error('stage_view_not_updated');lastReceipt=ack;pending=null;context=clone(latest);phase=ack.status==='confirmed_superseded'?'superseded':ack.calculated?'saved':'needs_review';error='';conflictRevision=null;return true;
   }catch{if(!disposed&&own===epoch){phase='unconfirmed';error='Aún no hay confirmación. Comprobar consulta la misma solicitud; conserva tu instrucción.';}return false;}
   finally{operation=null;resolveOperation();if(!disposed){if(phase==='idle'&&validContext(context))phase=capability(context.native_capability)?.write?'ready':'unavailable';notify();}}
  }
  return{setContext,setCommand,prepare,chooseMode,confirm:save,save,resume(){return save({resume:true});},restoreRejection,reconcile(){return pending?save():Promise.resolve(false);},status,clear,dispose(){clear();disposed=true;}};
 }
 const RECONCILE_DELAYS=[15000,30000,60000,60000,60000,60000];
 function createReconciler({getState,getContext,check,schedule=setTimeout,cancel=clearTimeout}){
  let timer=null,key=null,attempts=0,disposed=false;
  const cancelTimer=()=>{if(timer!==null)cancel(timer);timer=null;};
  const requestKey=s=>s?.pending&&id(s.pending_request_id)&&validContext(s.context)?identity(s.context)+'|'+s.pending_request_id:null;
  function reset(){cancelTimer();key=null;attempts=0;}
  function observe(s){
   if(disposed)return;
   const next=requestKey(s),current=getContext();
   if(!next||!validContext(current)||identity(current)!==identity(s.context)){reset();return;}
   if(next!==key){reset();key=next;}
   if(s.busy||s.phase!=='unconfirmed'){cancelTimer();return;}
   if(timer!==null||attempts>=RECONCILE_DELAYS.length)return;
   const ownKey=key;timer=schedule(async()=>{
    timer=null;if(disposed)return;const fresh=getState(),live=getContext();
    if(ownKey!==key||requestKey(fresh)!==ownKey||!validContext(live)||identity(live)!==identity(fresh.context)){reset();return;}
    if(fresh.busy||fresh.phase!=='unconfirmed')return;
    attempts++;try{await check();}catch{}if(!disposed)observe(getState());
   },RECONCILE_DELAYS[attempts]);
  }
  return{observe,reset,dispose(){disposed=true;reset();}};
 }
 function mount({container,getContext,onSave,onRefresh,onState=()=>{},validModel,uuid,doc=globalThis.document,win=globalThis.window,schedule=setTimeout,cancel=clearTimeout}){
  if(!container||!doc)throw Error('stage_container_required');
  let recognition=null,listening=false,disposed=false,reconciler=null,refreshing=false;
  const make=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  container.classList.add('ppp-stages');
  const heading=make('h3','','Etapas del proyecto'),intro=make('p','ppp-stages-intro','Dile al plan cómo organizar el calendario. Los cambios se guardan en el mismo libro.'),current=make('p','ppp-stages-current'),sourceEl=make('p','ppp-stages-source'),receiptEl=make('p','ppp-stages-receipt'),list=make('ol','ppp-stages-list');
  const form=make('form','ppp-stages-form'),label=make('label','','Instrucción para etapas'),input=make('textarea');input.rows=2;input.placeholder='Van a ser 3 etapas de 12 meses';input.setAttribute('aria-label','Instrucción para etapas');label.append(input);
  const preview=make('p','ppp-stages-preview'),buttons=make('div','ppp-stages-actions'),submit=make('button','','Revisar cambio'),confirm=make('button','','Guardar'),sequential=make('button','','Consecutivas'),parallel=make('button','','En paralelo'),mic=make('button','','Dictar'),retry=make('button','','Comprobar guardado'),resumeButton=make('button','','Reanudar mismo cambio'),reload=make('button','','Releer calendario'),statusEl=make('p','ppp-stages-status'),checks=make('ul','ppp-stages-checks');
  submit.type='submit';confirm.type='button';sequential.type='button';parallel.type='button';mic.type='button';retry.type='button';resumeButton.type='button';reload.type='button';retry.hidden=true;reload.hidden=true;statusEl.setAttribute('role','status');statusEl.setAttribute('aria-live','polite');preview.setAttribute('aria-live','polite');buttons.append(submit,confirm,sequential,parallel,mic,retry,resumeButton,reload);form.append(label,preview,buttons);container.append(heading,intro,current,sourceEl,list,form,statusEl,receiptEl,checks);
  const Speech=win?.SpeechRecognition||win?.webkitSpeechRecognition;mic.hidden=!Speech;
  function paint(s){
   if(disposed)return;const cap=capability(s.context?.native_capability),available=validContext(s.context)&&cap?.write;
   input.value=s.command;input.disabled=refreshing||s.busy||s.pending||!available;submit.disabled=refreshing||s.busy||s.pending||!available;confirm.hidden=s.phase!=='preview';confirm.disabled=refreshing||s.busy||s.pending||!available;sequential.hidden=parallel.hidden=!['clarify','unsupported'].includes(s.phase);sequential.disabled=parallel.disabled=refreshing||s.busy||s.pending||!available;mic.disabled=refreshing||s.busy||s.pending||!available;resumeButton.hidden=!s.resume_allowed;resumeButton.disabled=refreshing||s.busy||!available;retry.hidden=!s.pending;retry.disabled=refreshing||s.busy||!validContext(s.context);reload.hidden=typeof onRefresh!=='function'||!['conflict','rejected','blocked'].includes(s.phase);reload.disabled=refreshing||s.busy||s.pending||!available;list.replaceChildren();checks.replaceChildren();
   let collection;try{collection=validateCollection(s.context?.native_collection,cap?.max_stages,cap?.max_months);}catch{}
   const pendingInitial=initialPending(s.context);
   current.textContent=collection?`${collection.count} ${collection.count===1?'etapa actual':'etapas actuales'} · lectura de Sheets · revisión ${s.context.revision.slice(0,12)}`:pendingInitial?`1 etapa actual · duración pendiente · lectura de Sheets · revisión ${s.context.revision.slice(0,12)}`:'El calendario del libro todavía no está conectado a este tablero.';
   sourceEl.replaceChildren();const source=s.context?.stage_binding;if(source&&typeof source.spreadsheet_id==='string'&&Number.isInteger(source.sheet_id)){sourceEl.textContent=`Tipo: ${s.context.model_type} · versión: ${s.context.scenario_id} · libro: ${source.spreadsheet_id} · hoja Etapas: ${source.sheet_id}. `;const link=make('a','','Abrir Etapas en Sheets');link.href='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(source.spreadsheet_id)+'/edit#gid='+source.sheet_id;link.target='_blank';link.rel='noopener';sourceEl.append(link);}
   receiptEl.textContent=s.receipt?`Recibo: ${s.receipt.request_id} · base: ${s.receipt.base_revision} · resultado: ${s.receipt.revision}. Calendario confirmado; los resultados financieros se indican por separado.`:s.pending?`Solicitud pendiente: ${s.pending_request_id}. Aún no se declara aplicada.`:'';
   if(pendingInitial)list.append(make('li','ppp-stage-pending','Etapa 1 · duración por definir'));
   if(collection)for(const stage of collection.stages)list.append(make('li','',`Etapa ${stage.order} · mes ${stage.start_month} a ${stage.end_month} · ${stage.duration_months} meses`));
   if(s.proposal){
    const prior=collection?`${collection.count} etapas de ${collection.duration_months} meses`:pendingInitial?'1 etapa con duración pendiente':'calendario no disponible';
    preview.textContent=describeProposal(s.proposal.stages,s.proposal.stages.mode==='sequential'?cap?.assumption:'El reparto financiero no se propone en este cambio.')+` Cambio: ${prior} → ${s.proposal.stages.count} etapas de ${s.proposal.stages.duration_months} meses. Caso: ${s.context.case_id} · versión: ${s.context.scenario_id} · revisión: ${s.context.revision}. No se propone reparto financiero.`;
   }else preview.textContent='Revisa la instrucción para ver el cambio antes de guardarlo.';

   const messages={idle:'Abre un proyecto para organizar sus etapas.',unavailable:'La edición de etapas aún no está habilitada en este libro.',ready:'Escribe o dicta la instrucción y pulsa Revisar cambio.',clarify:'¿Las etapas serán consecutivas o en paralelo?',preview:'Revisa lo entendido y pulsa Guardar.',unsupported:'Las etapas en paralelo aún no están disponibles.',saving:'Guardando etapas y leyendo el cálculo de Sheets…',checking:'Consultando la confirmación del mismo cambio…',saved:'Etapas guardadas y comprobaciones de Sheets confirmadas.',needs_review:'Etapas guardadas. Hay comprobaciones pendientes en Sheets.',superseded:'Tu cambio quedó guardado. El libro tiene una revisión posterior; consulta su calendario actual.'};
   statusEl.textContent=refreshing?'Leyendo el calendario actual. Tu instrucción se conserva…':s.error||messages[s.phase]||messages.unavailable;
   const currentChecks=nativeChecks(s.context)||(s.receipt&&s.receipt.revision===s.context?.revision?s.receipt.checks:null);
   if(currentChecks)for(const k of CHECKS)checks.append(make('li',currentChecks[k]?'ppp-check-ok':'ppp-check-pending',`${CHECK_LABELS[k]}: ${currentChecks[k]?'conciliado':'pendiente'}`));
   container.dataset.stageState=s.phase;onState({phase:s.phase,dirty:!!s.command&&!s.receipt,pending:s.pending,busy:s.busy||refreshing,calculated:!!currentChecks&&CHECKS.every(k=>currentChecks[k]),error:s.error});reconciler?.observe(s);
  }
  const controller=createController({getContext,onSave,onState:paint,validModel,uuid});
  reconciler=createReconciler({getState:controller.status,getContext,check:controller.reconcile,schedule,cancel});
  async function refresh(){
   const before=controller.status();if(disposed||refreshing||before.busy||before.pending||typeof onRefresh!=='function'||!validContext(before.context)||!['conflict','rejected','blocked'].includes(before.phase))return false;
   refreshing=true;paint(before);let failed=false;
   try{await onRefresh();if(disposed||identity(getContext())!==identity(before.context))return false;return controller.setContext(getContext());}
   catch{failed=true;return false;}
   finally{refreshing=false;if(!disposed){paint(controller.status());if(failed)statusEl.textContent='No se pudo releer el calendario. Tu instrucción se conserva; vuelve a intentarlo.';}}
  }
  input.addEventListener('input',()=>{if(!refreshing)controller.setCommand(input.value);});form.addEventListener('submit',e=>{e.preventDefault();if(!refreshing)controller.prepare();});confirm.addEventListener('click',()=>controller.confirm());sequential.addEventListener('click',()=>controller.chooseMode('sequential'));parallel.addEventListener('click',()=>controller.chooseMode('parallel'));retry.addEventListener('click',()=>controller.reconcile());resumeButton.addEventListener('click',()=>controller.resume());reload.addEventListener('click',refresh);
  mic.addEventListener('click',()=>{
   if(!Speech||mic.disabled)return;if(listening){recognition?.stop();return;}
   const dictationState=controller.status(),dictationContext=dictationState.context;
   try{recognition=new Speech();recognition.lang='es-MX';recognition.interimResults=false;recognition.continuous=false;
    recognition.onresult=e=>{const current=controller.status(),now=current.context;if(disposed||!dictationContext||current.generation!==dictationState.generation||identity(now)!==identity(dictationContext)||now.revision!==dictationContext.revision)return;const result=e.results?.[e.resultIndex||0];if(result?.isFinal!==false&&result?.[0]?.transcript)controller.setCommand(result[0].transcript);};
    recognition.onerror=()=>{statusEl.textContent='No se pudo completar el dictado. Puedes escribir la misma instrucción.';};
    recognition.onend=()=>{listening=false;mic.textContent='Dictar';mic.setAttribute('aria-pressed','false');};
    recognition.start();listening=true;mic.textContent='Detener dictado';mic.setAttribute('aria-pressed','true');
   }catch{statusEl.textContent='El dictado no está disponible. Escribe la instrucción para continuar.';}
  });
  const revoke=()=>{recognition?.abort?.();controller.clear();};const storage=e=>{if(e.key===null||e.key==='pyod_clave_v1')revoke();};win?.addEventListener('pagehide',revoke);win?.addEventListener('storage',storage);controller.setContext(getContext());
  return{setContext:controller.setContext,setCommand:controller.setCommand,prepare:controller.prepare,chooseMode:controller.chooseMode,confirm:controller.confirm,save:controller.save,resume:controller.resume,refresh,restoreRejection:controller.restoreRejection,snapshotStatus:controller.status,dispose(){disposed=true;reconciler.dispose();recognition?.abort?.();controller.dispose();win?.removeEventListener('pagehide',revoke);win?.removeEventListener('storage',storage);container.replaceChildren();}};
 }
 return{PREWRITE_ERRORS,prewriteRejected,MAX_STAGES,MAX_MONTHS,CHECKS,REJECTIONS,RECONCILE_DELAYS,stable,rejection,capability,validateStages,validateCollection,validContext,initialPending,nativeChecks,request,receipt,parseCommand,describeProposal,createController,createReconciler,mount};
});

